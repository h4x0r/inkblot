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
// Wall-clock cap for the commit-fetch phase, comfortably under the function's
// execution limit so it always returns (partial + truncated) rather than being
// killed. At ~150ms/call across DEFAULT_CONCURRENCY workers this still covers
// roughly a thousand calls.
const DEFAULT_BUDGET_MS = 15_000;
// Tighter budget for the public /u path: it also feeds the README-embed PNG,
// which renders behind GitHub's image proxy (Camo) and its ~seconds timeout.
const PUBLIC_BUDGET_MS = 8_000;
const DAY_MS = 86_400_000;

export interface FetchOptions {
  sinceDays?: number;
  maxRepos?: number;
  maxCommits?: number;
  concurrency?: number;
  /**
   * Wall-clock budget (ms) for the commit-fetch phase. When it elapses the
   * fetch stops and returns what it has, marked `truncated`. This guarantees a
   * response well inside the serverless function's execution limit — without it
   * a many-repo account overruns the limit and the platform kills the function
   * mid-flight, which the browser sees as a bare "Failed to fetch".
   */
  budgetMs?: number;
  /** Injectable clock (testing seam); defaults to Date.now. */
  now?: () => number;
}

interface RepoRef {
  owner: string;
  name: string;
  label: string;
}

// One repo's slice of a batched GraphQL `history` response. target/branch are
// null for an empty or branch-less repo.
interface RepoHistory {
  defaultBranchRef: {
    target: {
      history: {
        nodes: { committedDate: string }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } | null;
  } | null;
}

// Repos packed into one GraphQL request. Each adds a `history(first:100)`
// connection; ~15 keeps the query's node budget comfortable while collapsing N
// per-repo round-trips into ⌈N/15⌉.
const HISTORY_BATCH = 15;

/**
 * Fetch authored commits for `refs` via batched GraphQL `history` queries — many
 * repos per request, full `committedDate` timestamps, every page of each repo.
 * Returns `truncated` when the commit cap or the wall-clock deadline stopped it
 * before every repo was fully paged. The `author: { id }` filter matches REST's
 * author matching (verified at commit-count parity on real accounts).
 */
async function fetchAuthoredCommits(
  octo: Octokit,
  refs: RepoRef[],
  authorId: string,
  since: string,
  opts: { maxCommits: number; deadline: number; now: () => number },
): Promise<{ events: CommitEvent[]; truncated: boolean }> {
  const events: CommitEvent[] = [];
  const pending = refs.map((ref) => ({
    ref,
    cursor: null as string | null,
    done: false,
  }));
  let truncated = false;

  while (events.length < opts.maxCommits) {
    if (opts.now() >= opts.deadline) {
      truncated = true;
      break;
    }
    const batch = pending.filter((t) => !t.done).slice(0, HISTORY_BATCH);
    if (batch.length === 0) break;

    const decls = ["$since:GitTimestamp!", "$aid:ID!"];
    const fields: string[] = [];
    const vars: Record<string, unknown> = { since, aid: authorId };
    batch.forEach((t, i) => {
      decls.push(`$o${i}:String!`, `$n${i}:String!`, `$a${i}:String`);
      vars[`o${i}`] = t.ref.owner;
      vars[`n${i}`] = t.ref.name;
      vars[`a${i}`] = t.cursor;
      fields.push(
        `r${i}: repository(owner: $o${i}, name: $n${i}) { ` +
          `defaultBranchRef { target { ... on Commit { ` +
          `history(first: 100, since: $since, author: { id: $aid }, after: $a${i}) { ` +
          `nodes { committedDate } pageInfo { hasNextPage endCursor } } } } } }`,
      );
    });
    const query = `query (${decls.join(", ")}) { ${fields.join(" ")} }`;

    let res: Record<string, RepoHistory | null>;
    try {
      res = await octo.graphql<Record<string, RepoHistory | null>>(query, vars);
    } catch (err) {
      // A partial failure (one inaccessible/empty repo) still carries data for
      // the rest; use it. A total failure drops this batch rather than stalling.
      const data = (err as { data?: Record<string, RepoHistory | null> }).data;
      if (!data) {
        batch.forEach((t) => (t.done = true));
        continue;
      }
      res = data;
    }

    batch.forEach((t, i) => {
      const h = res[`r${i}`]?.defaultBranchRef?.target?.history;
      if (!h) {
        t.done = true; // empty repo, no default branch, or inaccessible
        return;
      }
      for (const node of h.nodes) {
        const ts = Date.parse(node.committedDate);
        if (!Number.isNaN(ts)) events.push({ repo: t.ref.label, ts });
      }
      if (h.pageInfo.hasNextPage) t.cursor = h.pageInfo.endCursor;
      else t.done = true;
    });
  }

  if (events.length >= opts.maxCommits || pending.some((t) => !t.done)) {
    truncated = true;
  }
  return { events: events.slice(0, opts.maxCommits), truncated };
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
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS);

  // Repos the viewer can see, most-recently-pushed first. Page lazily and stop
  // as soon as we hold enough recently-pushed repos: the feed is sorted
  // pushed-desc, so once a repo falls outside the lookback window every later
  // repo does too, and once we hold maxRepos in-window repos the rest are older
  // still. Eagerly walking every page would pull the whole affiliation set into
  // memory — an account in large orgs can be affiliated with thousands of repos
  // — and OOM the function before the maxRepos cap ever applies.
  type RepoList = Awaited<
    ReturnType<typeof octo.rest.repos.listForAuthenticatedUser>
  >["data"];
  const repos: RepoList = [];
  let truncated = false;
  for await (const { data } of octo.paginate.iterator(
    octo.rest.repos.listForAuthenticatedUser,
    {
      affiliation: "owner,collaborator,organization_member",
      sort: "pushed",
      direction: "desc",
      per_page: PER_PAGE,
    },
  )) {
    let stop = false;
    for (const r of data) {
      if ((r.pushed_at ?? "") < since) {
        stop = true; // older than the window — and so is everything after it
        break;
      }
      if (repos.length >= maxRepos) {
        truncated = true; // a recent repo beyond the cap — some activity omitted
        stop = true;
        break;
      }
      repos.push(r);
    }
    if (stop) break;
  }

  // Private-repo labels (for the share warning) + the (owner, name) refs to query.
  const privateRepos = new Set<string>();
  const refs: RepoRef[] = [];
  for (const r of repos) {
    const owner = r.owner?.login;
    if (!owner) continue;
    const label = repoLabel(r.full_name, login);
    if (r.private) privateRepos.add(label);
    refs.push({ owner, name: r.name, label });
  }

  // The viewer's node id for GraphQL's author filter. Batched history pulls
  // every repo's authored commits in a handful of requests instead of one REST
  // crawl per repo per page — so a many-repo account finishes inside the budget.
  const { viewer } = await octo.graphql<{ viewer: { id: string } }>(
    "{ viewer { id } }",
  );
  const fetched = await fetchAuthoredCommits(octo, refs, viewer.id, since, {
    maxCommits,
    deadline,
    now,
  });

  return {
    events: fetched.events,
    truncated: truncated || fetched.truncated,
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

  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.budgetMs ?? PUBLIC_BUDGET_MS);

  // Page lazily and stop once we hold enough recently-pushed non-fork repos —
  // see fetchCommitEvents for why eager enumeration is unsafe. Repos are sorted
  // pushed-desc, so a repo older than the window means every later one is too.
  type RepoList = Awaited<
    ReturnType<typeof octo.rest.repos.listForUser>
  >["data"];
  const repos: RepoList = [];
  let truncated = false;
  for await (const { data } of octo.paginate.iterator(
    octo.rest.repos.listForUser,
    {
      username,
      type: "owner",
      sort: "pushed",
      direction: "desc",
      per_page: PER_PAGE,
    },
  )) {
    let stop = false;
    for (const r of data) {
      if ((r.pushed_at ?? "") < since) {
        stop = true;
        break;
      }
      if (r.fork) continue; // skip forks — not the user's own work
      if (repos.length >= maxRepos) {
        truncated = true;
        stop = true;
        break;
      }
      repos.push(r);
    }
    if (stop) break;
  }

  const events: CommitEvent[] = [];
  let cursor = 0;
  let hitDeadline = false;
  const worker = async () => {
    while (cursor < repos.length && events.length < maxCommits) {
      if (now() >= deadline) {
        hitDeadline = true;
        return;
      }
      const r = repos[cursor++];
      const label = repoLabel(r.full_name, username);
      try {
        for (let page = 1; page <= PUBLIC_MAX_PAGES; page++) {
          if (now() >= deadline) {
            hitDeadline = true;
            break;
          }
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
  if (events.length >= maxCommits || hitDeadline) truncated = true;
  return { viewer, events: events.slice(0, maxCommits), sinceDays, truncated };
}
