import {
  binCommitsHourly,
  type CommitEvent,
  detectOnsetWindow,
} from "./activity";
import type { Viewer } from "./github";
import { classifyPersona, type Persona } from "./persona";

export interface RepoInfo {
  name: string;
  total: number;
  private: boolean;
}

export interface ActivityResponse {
  viewer: Viewer;
  empty: boolean;
  truncated: boolean;
  persona: Persona | null;
  lookbackDays: number;
  start: number;
  stepHours: number;
  hours: number;
  series: Record<string, number[]>;
  repos: RepoInfo[];
  window: { from: number; to: number };
}

/**
 * Shape commit events into the activity payload the dashboard and the public
 * /u explorer both consume — binning, onset window, persona, and the
 * busiest-first repo list. Shared so both surfaces behave identically.
 */
export function buildActivityResponse(opts: {
  viewer: Viewer;
  events: CommitEvent[];
  sinceDays: number;
  truncated: boolean;
  privateRepos?: string[];
}): ActivityResponse {
  const { viewer, events, sinceDays, truncated, privateRepos = [] } = opts;
  if (events.length === 0) {
    return {
      viewer,
      empty: true,
      truncated: false,
      persona: null,
      lookbackDays: sinceDays,
      start: 0,
      stepHours: 1,
      hours: 0,
      series: {},
      repos: [],
      window: { from: 0, to: 0 },
    };
  }

  const s = binCommitsHourly(events);
  const w = detectOnsetWindow(s);
  const total = new Array<number>(s.hours).fill(0);
  for (const arr of Object.values(s.series)) {
    for (let i = 0; i < s.hours; i++) total[i] += arr[i];
  }
  const persona = classifyPersona({
    start: s.start,
    stepHours: s.stepHours,
    total,
  });
  const priv = new Set(privateRepos);
  const repos = Object.entries(s.totals)
    .sort((a, b) => b[1] - a[1])
    .map(([name, t]) => ({ name, total: t, private: priv.has(name) }));

  return {
    viewer,
    empty: false,
    truncated,
    persona,
    lookbackDays: sinceDays,
    start: s.start,
    stepHours: s.stepHours,
    hours: s.hours,
    series: s.series,
    repos,
    window: { from: w.from, to: w.to },
  };
}
