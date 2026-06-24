/**
 * Pure view-state math for the inkblot explorer.
 *
 * The dashboard, the public /u explorer, and the server-side image route all
 * need the same answers: what's the default time range, how do URL params seed
 * a view, which params are non-default (so we can omit them), and what does the
 * /api/render body look like. Those decisions live here — unit-tested in
 * isolation — so the React components and the route are thin shells (Humble
 * Object). No DOM, no fetch, no React.
 */

import {
  type ChartParams,
  decodeRepoMask,
  defaultRepoSelection,
  encodeRepoMask,
  HOUR_MS,
  type RepoTotal,
} from "./activity";

export interface ViewData {
  start: number;
  stepHours: number;
  hours: number;
  series: Record<string, number[]>;
  repos: RepoTotal[];
  window: { from: number; to: number };
}

export const stepMsOf = (stepHours: number) => stepHours * HOUR_MS;
export const msToIndex = (ms: number, start: number, stepMs: number) =>
  Math.round((ms - start) / stepMs);
export const indexToMs = (i: number, start: number, stepMs: number) =>
  start + i * stepMs;
export const clampIndex = (i: number, hours: number) =>
  Math.max(0, Math.min(i, hours - 1));

/** Repo names, lexicographically sorted — the canonical bitmask universe. MUST
 * match the image route's `Object.keys(totals).sort()`. */
export function sortedRepoNames(d: ViewData): string[] {
  return d.repos.map((r) => r.name).sort();
}

/** The default [from, to] bin indices, from the onset window, clamped. */
export function defaultRange(d: ViewData): [number, number] {
  const stepMs = stepMsOf(d.stepHours);
  return [
    clampIndex(msToIndex(d.window.from, d.start, stepMs), d.hours),
    clampIndex(msToIndex(d.window.to, d.start, stepMs), d.hours),
  ];
}

/** Seed the explorer's [selected, range] from URL params (client mount). */
export function seedView(
  d: ViewData,
  params: ChartParams,
): { selected: string[]; range: [number, number] } {
  const stepMs = stepMsOf(d.stepHours);
  const selected = params.reposMask
    ? decodeRepoMask(sortedRepoNames(d), params.reposMask)
    : defaultRepoSelection(d.repos);
  const def = defaultRange(d);
  const from =
    params.from !== undefined
      ? clampIndex(msToIndex(params.from, d.start, stepMs), d.hours)
      : def[0];
  const to =
    params.to !== undefined
      ? clampIndex(msToIndex(params.to, d.start, stepMs), d.hours)
      : def[1];
  return { selected, range: [from, to] };
}

/** Resolve params to selected repos + an ms window (server-side image route). */
export function resolveView(
  d: ViewData,
  params: ChartParams,
): { selected: string[]; window: [number, number] } {
  const selected = params.reposMask
    ? decodeRepoMask(sortedRepoNames(d), params.reposMask)
    : defaultRepoSelection(d.repos);
  return {
    selected,
    window: [params.from ?? d.window.from, params.to ?? d.window.to],
  };
}

/** The shareable query string, omitting any param that equals its default, so
 * the common URL stays clean (and the image CDN key is stable). */
export function buildShareParams(
  d: ViewData,
  selected: Iterable<string>,
  range: [number, number],
): string {
  const stepMs = stepMsOf(d.stepHours);
  const sorted = sortedRepoNames(d);
  const def = defaultRange(d);
  const p = new URLSearchParams();
  if (range[0] !== def[0] || range[1] !== def[1]) {
    p.set("from", String(indexToMs(range[0], d.start, stepMs)));
    p.set("to", String(indexToMs(range[1], d.start, stepMs)));
  }
  const mask = encodeRepoMask(sorted, selected);
  const defMask = encodeRepoMask(sorted, defaultRepoSelection(d.repos));
  if (mask !== defMask) p.set("repos", mask);
  return p.toString();
}

export interface RenderPayload {
  start: number;
  step_hours: number;
  series: Record<string, number[]>;
  selected: string[];
  window: [number, number];
  title: string;
  subtitle?: string;
  persona_emoji?: string;
  avatar_url?: string;
}

/** The /api/render request body for a selection + range. */
export function buildRenderPayload(
  d: ViewData,
  selected: Iterable<string>,
  range: [number, number],
  opts: {
    title: string;
    subtitle?: string;
    personaEmoji?: string;
    avatarUrl?: string;
  },
): RenderPayload {
  const stepMs = stepMsOf(d.stepHours);
  return {
    start: d.start,
    step_hours: d.stepHours,
    series: d.series,
    selected: [...selected],
    window: [
      indexToMs(range[0], d.start, stepMs),
      indexToMs(range[1], d.start, stepMs),
    ],
    title: opts.title,
    subtitle: opts.subtitle,
    persona_emoji: opts.personaEmoji,
    avatar_url: opts.avatarUrl,
  };
}
