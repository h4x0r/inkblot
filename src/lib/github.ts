/**
 * GitHub activity fetch. Uses the Search Commits API to pull the viewer's
 * authored commits across every repo their token can see (public always;
 * private too when the OAuth grant includes the `repo` scope), each carrying a
 * repo name and commit timestamp — exactly what `binCommitsHourly` consumes.
 *
 * The Search API caps a single query at 1000 results, so a very prolific author
 * gets their most-recent 1000 commits. That covers the recent-activity story the
 * inkblot is about; the cap is logged, never silently hidden.
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
  /** True when the 1000-result Search cap was hit (older commits omitted). */
  truncated: boolean;
}

const SEARCH_CAP = 1000;
const PER_PAGE = 100;

/**
 * Fetch the viewer's authored commit events, newest first, up to the Search cap.
 * `repoLabel` shortens "owner/repo" to "repo" when the owner is the viewer, so
 * the legend reads cleanly for a developer looking at their own work.
 */
export async function fetchCommitEvents(
  token: string,
  login: string,
  opts: { maxCommits?: number } = {},
): Promise<FetchResult> {
  const octo = new Octokit({ auth: token });
  const maxCommits = Math.min(opts.maxCommits ?? SEARCH_CAP, SEARCH_CAP);
  const events: CommitEvent[] = [];
  let truncated = false;

  for (let page = 1; events.length < maxCommits; page++) {
    const { data } = await octo.rest.search.commits({
      q: `author:${login}`,
      sort: "author-date",
      order: "desc",
      per_page: PER_PAGE,
      page,
    });

    for (const item of data.items) {
      const full = item.repository?.full_name ?? "unknown";
      const repo = repoLabel(full, login);
      const dateStr = item.commit?.author?.date ?? item.commit?.committer?.date;
      if (!dateStr) continue;
      const ts = Date.parse(dateStr);
      if (!Number.isNaN(ts)) events.push({ repo, ts });
    }

    if (data.items.length < PER_PAGE) break; // reached the end of results
    if (page * PER_PAGE >= SEARCH_CAP) {
      truncated = (data.total_count ?? 0) > SEARCH_CAP;
      break;
    }
  }

  return { events: events.slice(0, maxCommits), truncated };
}

export function repoLabel(fullName: string, login: string): string {
  const slash = fullName.indexOf("/");
  if (slash < 0) return fullName;
  const owner = fullName.slice(0, slash);
  return owner.toLowerCase() === login.toLowerCase()
    ? fullName.slice(slash + 1)
    : fullName;
}
