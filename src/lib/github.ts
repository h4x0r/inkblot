/**
 * GitHub activity fetch.
 *
 * Enumerates the repos the viewer can see (owner / collaborator / org member),
 * then pulls the viewer's authored commits per repo over a lookback window. This
 * uses the core REST rate limit (5000/hr) and has no per-query result cap, so it
 * reaches months/years back — unlike the Search Commits API, which caps at 1000
 * results and returns only the most-recent commits (≈ a few days for a prolific
 * author). Caps (repos, commits, pages-per-repo) bound latency and are surfaced
 * via `truncated`, never silently hidden.
 *
 * Trade-off: this sees repos the token is affiliated with, so one-off external
 * open-source contributions to repos the viewer isn't a member of are not
 * included (the Search API would catch those but can't reach back far).
 */

import { Octokit } from "@octokit/rest";
import type { CommitEvent } from "./activity";

export interface Viewer {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export async function getViewer(token: string): Promise<Viewer> {
  const octo = new Octokit({ auth: token });
  const { data } = await octo.rest.users.getAuthenticated();
  return { login: data.login, name: data.name, avatarUrl: data.avatar_url };
}

export interface FetchResult {
  events: CommitEvent[];
  /** True when a repo/commit cap was hit (some older/extra activity omitted). */
  truncated: boolean;
  /** Lookback window actually used, in days. */
  sinceDays: number;
  /** Labels of repos that are private (so the UI can warn before sharing). */
  privateRepos: string[];
}

const PER_PAGE = 100;
const DEFAULT_SINCE_DAYS = 548; // ~18 months
const DEFAULT_MAX_REPOS = 150;
const DEFAULT_MAX_COMMITS = 30_000;
const MAX_PAGES_PER_REPO = 10; // ≤ 1000 commits/repo, bounds a single hot repo
const DEFAULT_CONCURRENCY = 10;
const DAY_MS = 86_400_000;

export interface FetchOptions {
  sinceDays?: number;
  maxRepos?: number;
  maxCommits?: number;
  concurrency?: number;
}

/**
 * Fetch the viewer's authored commit events over the lookback window.
 * `repoLabel` shortens "owner/repo" to "repo" when the owner is the viewer, so
 * the legend reads cleanly for a developer looking at their own work.
 */
export async function fetchCommitEvents(
  token: string,
  login: string,
  opts: FetchOptions = {},
): Promise<FetchResult> {
  const octo = new Octokit({ auth: token });
  const sinceDays = opts.sinceDays ?? DEFAULT_SINCE_DAYS;
  const since = new Date(Date.now() - sinceDays * DAY_MS).toISOString();
  const maxRepos = opts.maxRepos ?? DEFAULT_MAX_REPOS;
  const maxCommits = opts.maxCommits ?? DEFAULT_MAX_COMMITS;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;

  // repos the viewer can see, most-recently-pushed first
  const allRepos = await octo.paginate(
    octo.rest.repos.listForAuthenticatedUser,
    {
      affiliation: "owner,collaborator,organization_member",
      sort: "pushed",
      direction: "desc",
      per_page: PER_PAGE,
    },
  );
  const active = allRepos.filter((r) => (r.pushed_at ?? "") >= since);
  const repos = active.slice(0, maxRepos);
  let truncated = active.length > maxRepos;

  const events: CommitEvent[] = [];
  const privateRepos = new Set<string>();
  let cursor = 0;

  const worker = async () => {
    while (cursor < repos.length && events.length < maxCommits) {
      const r = repos[cursor++];
      const owner = r.owner?.login;
      if (!owner) continue;
      const label = repoLabel(r.full_name, login);
      if (r.private) privateRepos.add(label);
      try {
        for (let page = 1; page <= MAX_PAGES_PER_REPO; page++) {
          const { data } = await octo.rest.repos.listCommits({
            owner,
            repo: r.name,
            author: login,
            since,
            per_page: PER_PAGE,
            page,
          });
          for (const c of data) {
            const dateStr = c.commit?.author?.date ?? c.commit?.committer?.date;
            if (!dateStr) continue;
            const ts = Date.parse(dateStr);
            if (!Number.isNaN(ts)) {
              events.push({ repo: label, ts });
            }
          }
          if (data.length < PER_PAGE) break; // last page for this repo
        }
      } catch {
        // empty repo (409), revoked access, etc. — skip, never fail the fetch
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  if (events.length >= maxCommits) truncated = true;
  return {
    events: events.slice(0, maxCommits),
    truncated,
    sinceDays,
    privateRepos: [...privateRepos],
  };
}

export function repoLabel(fullName: string, login: string): string {
  const slash = fullName.indexOf("/");
  if (slash < 0) return fullName;
  const owner = fullName.slice(0, slash);
  return owner.toLowerCase() === login.toLowerCase()
    ? fullName.slice(slash + 1)
    : fullName;
}

// GitHub usernames: 1–39 chars, alphanumeric or single (non-consecutive)
// hyphens, never leading/trailing. Validates the public /u/<username> param.
const GH_USERNAME = /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/;

export function isValidGitHubUsername(s: string): boolean {
  return GH_USERNAME.test(s);
}

export interface PublicActivity {
  viewer: Viewer;
  events: CommitEvent[];
  sinceDays: number;
  truncated: boolean;
}

const PUBLIC_MAX_PAGES = 3; // ≤300 commits/repo — bounded for the embed/Camo timeout

/**
 * Fetch ANY user's PUBLIC commit activity (no login, no `repo` scope). Uses the
 * app's GITHUB_TOKEN if set (5000/hr) and falls back to unauthenticated. Bounded
 * tighter than the signed-in fetch so the README-embed render beats GitHub's
 * image-proxy timeout; the CDN caches the result.
 */
export async function fetchPublicActivity(
  username: string,
  opts: FetchOptions = {},
): Promise<PublicActivity> {
  const octo = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const sinceDays = opts.sinceDays ?? 365;
  const since = new Date(Date.now() - sinceDays * DAY_MS).toISOString();
  const maxRepos = opts.maxRepos ?? 40;
  const maxCommits = opts.maxCommits ?? 8000;
  const concurrency = opts.concurrency ?? 10;

  const { data: u } = await octo.rest.users.getByUsername({ username });
  const viewer: Viewer = {
    login: u.login,
    name: u.name,
    avatarUrl: u.avatar_url,
  };

  const allRepos = await octo.paginate(octo.rest.repos.listForUser, {
    username,
    type: "owner",
    sort: "pushed",
    direction: "desc",
    per_page: PER_PAGE,
  });
  const active = allRepos.filter(
    (r) => !r.fork && (r.pushed_at ?? "") >= since,
  );
  const repos = active.slice(0, maxRepos);
  let truncated = active.length > maxRepos;

  const events: CommitEvent[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < repos.length && events.length < maxCommits) {
      const r = repos[cursor++];
      const label = repoLabel(r.full_name, username);
      try {
        for (let page = 1; page <= PUBLIC_MAX_PAGES; page++) {
          const { data } = await octo.rest.repos.listCommits({
            owner: username,
            repo: r.name,
            author: username,
            since,
            per_page: PER_PAGE,
            page,
          });
          for (const c of data) {
            const dateStr = c.commit?.author?.date ?? c.commit?.committer?.date;
            if (!dateStr) continue;
            const ts = Date.parse(dateStr);
            if (!Number.isNaN(ts)) events.push({ repo: label, ts });
          }
          if (data.length < PER_PAGE) break;
        }
      } catch {
        // empty/inaccessible repo — skip
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (events.length >= maxCommits) truncated = true;
  return { viewer, events: events.slice(0, maxCommits), sinceDays, truncated };
}
