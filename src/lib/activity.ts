/**
 * Pure, source-agnostic activity math for the inkblot.
 *
 * A list of commit events (repo + epoch-ms timestamp) is binned into per-repo
 * hourly counts; the default time window is derived by finding where the
 * fleet's smoothed activity ramps up and backing off a little — "just before
 * activity got intense". None of this knows about GitHub or matplotlib, so it
 * is unit-testable with hand-built arrays.
 */

export const HOUR_MS = 3_600_000;

export interface CommitEvent {
  repo: string;
  /** Commit timestamp as epoch milliseconds (UTC). */
  ts: number;
}

export interface HourlySeries {
  /** Epoch ms of the first (hour-aligned) bin. */
  start: number;
  stepHours: number;
  /** Number of hourly bins; every series array has this length. */
  hours: number;
  /** repo -> per-hour commit counts (length === hours). */
  series: Record<string, number[]>;
  /** repo -> total commit count. */
  totals: Record<string, number>;
}

export interface OnsetOptions {
  /** Gaussian smoothing width, in bins. 0 = identity (no smoothing). */
  sigmaBins?: number;
  /** Onset fires when smoothed activity first reaches this fraction of peak. */
  peakFraction?: number;
  /** Bins to back off from the crossing, so the window opens just *before* it. */
  padBins?: number;
}

const DEFAULT_ONSET: Required<OnsetOptions> = {
  sigmaBins: 8,
  peakFraction: 0.15,
  padBins: 72,
};

/**
 * Gaussian-smooth a series. `sigmaBins <= 0` returns an unmodified copy so the
 * caller always gets a fresh array it can mutate.
 */
export function gaussianSmooth(values: number[], sigmaBins: number): number[] {
  // Identity for non-positive, NaN, or so-tiny-it-underflows sigma: a denormal
  // sigma makes the variance (2*sigma^2) underflow to 0, turning the kernel
  // into exp(0/0)=NaN. Below ~1e-3 bins the smoothing is a no-op anyway.
  if (!(2 * sigmaBins * sigmaBins > 0) || sigmaBins < 1e-3) {
    return values.slice();
  }
  const half = Math.max(1, Math.ceil(sigmaBins * 4));
  const kernel: number[] = [];
  let sum = 0;
  for (let k = -half; k <= half; k++) {
    const w = Math.exp(-(k * k) / (2 * sigmaBins * sigmaBins));
    kernel.push(w);
    sum += w;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const n = values.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j < 0 || j >= n) continue;
      acc += values[j] * kernel[k + half];
    }
    out[i] = acc;
  }
  return out;
}

/**
 * Index of the bin where activity first ramps up, backed off by `padBins`.
 * Returns 0 for an empty/all-zero series (nothing to anchor on).
 */
export function findOnsetIndex(
  values: number[],
  opts: OnsetOptions = {},
): number {
  const { sigmaBins, peakFraction, padBins } = { ...DEFAULT_ONSET, ...opts };
  if (values.length === 0) return 0;
  const smooth = gaussianSmooth(values, sigmaBins);
  const peak = Math.max(...smooth);
  if (peak <= 0) return 0;
  const threshold = peakFraction * peak;
  let cross = 0;
  for (let i = 0; i < smooth.length; i++) {
    if (smooth[i] >= threshold) {
      cross = i;
      break;
    }
  }
  return Math.max(0, cross - padBins);
}

/** Floor an epoch-ms timestamp to the start of its UTC hour. */
function floorToHour(ts: number): number {
  return Math.floor(ts / HOUR_MS) * HOUR_MS;
}

/**
 * Bin commit events into per-repo hourly counts spanning first→last commit.
 * Throws on empty input — an empty inkblot is a bug upstream, not a valid state.
 */
export function binCommitsHourly(
  events: CommitEvent[],
  opts: { stepHours?: number } = {},
): HourlySeries {
  if (events.length === 0) {
    throw new Error("binCommitsHourly: no commit events to bin");
  }
  const stepHours = opts.stepHours ?? 1;
  const stepMs = stepHours * HOUR_MS;

  let min = Infinity;
  let max = -Infinity;
  for (const e of events) {
    const b = floorToHour(e.ts);
    if (b < min) min = b;
    if (b > max) max = b;
  }
  const start = min;
  const hours = Math.floor((max - start) / stepMs) + 1;

  const series: Record<string, number[]> = {};
  const totals: Record<string, number> = {};
  for (const e of events) {
    if (!series[e.repo]) {
      series[e.repo] = new Array<number>(hours).fill(0);
      totals[e.repo] = 0;
    }
    const idx = Math.floor((floorToHour(e.ts) - start) / stepMs);
    series[e.repo][idx] += 1;
    totals[e.repo] += 1;
  }

  return { start, stepHours, hours, series, totals };
}

export interface RepoTotal {
  name: string;
  total: number;
}

/**
 * The repos to select by default: the busiest ones that together cover
 * `coverage` of all commits (default 90%), hard-capped at `cap` (default 25).
 * A focused developer gets a handful; a polymath gets up to the cap — instead of
 * an arbitrary fixed count. Returns all repo names when every total is zero.
 */
export function defaultRepoSelection(
  repos: RepoTotal[],
  opts: { coverage?: number; cap?: number } = {},
): string[] {
  const coverage = opts.coverage ?? 0.9;
  const cap = opts.cap ?? 25;
  const total = repos.reduce((sum, r) => sum + r.total, 0);
  if (total <= 0) return repos.map((r) => r.name);

  const sorted = [...repos].sort((a, b) => b.total - a.total);
  const target = total * coverage;
  const out: string[] = [];
  let cum = 0;
  for (const r of sorted) {
    out.push(r.name);
    cum += r.total;
    if (out.length >= cap || cum >= target) break;
  }
  return out;
}

export interface OnsetWindow {
  /** Epoch ms of the window start. */
  from: number;
  /** Epoch ms of the window end (last bin). */
  to: number;
  /** Bin index the window starts at. */
  fromIndex: number;
}

/**
 * The default time window: opens just before the fleet's combined activity
 * ramps up, closes at the last bin.
 */
export function detectOnsetWindow(
  s: HourlySeries,
  opts: OnsetOptions = {},
): OnsetWindow {
  const total = new Array<number>(s.hours).fill(0);
  for (const repo of Object.keys(s.series)) {
    const arr = s.series[repo];
    for (let i = 0; i < s.hours; i++) total[i] += arr[i];
  }
  const fromIndex = findOnsetIndex(total, opts);
  const stepMs = s.stepHours * HOUR_MS;
  return {
    fromIndex,
    from: s.start + fromIndex * stepMs,
    to: s.start + (s.hours - 1) * stepMs,
  };
}

// --- URL state for the public /u explorer -----------------------------------

export interface ChartParams {
  from?: number;
  to?: number;
  /** Raw base64url repo bitmask (decoded against the name-sorted repo list). */
  reposMask?: string;
}

/** Parse from/to (epoch-ms or ISO) and the raw repo mask out of the URL. */
export function parseChartParams(p: URLSearchParams): ChartParams {
  const num = (v: string | null): number | undefined => {
    if (!v) return undefined;
    if (/^\d+$/.test(v)) return Number(v);
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : t;
  };
  return {
    from: num(p.get("from")),
    to: num(p.get("to")),
    reposMask: p.get("repos") || undefined,
  };
}

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function bytesToB64url(bytes: number[]): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      B64URL[(n >> 18) & 63] +
      B64URL[(n >> 12) & 63] +
      B64URL[(n >> 6) & 63] +
      B64URL[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63];
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63];
  }
  return out;
}

function b64urlToBytes(s: string): number[] {
  const v = (c: string) => B64URL.indexOf(c);
  const bytes: number[] = [];
  let i = 0;
  for (; i + 3 < s.length; i += 4) {
    const n = (v(s[i]) << 18) | (v(s[i + 1]) << 12) | (v(s[i + 2]) << 6) | v(s[i + 3]);
    bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  const rem = s.length - i;
  if (rem === 2) {
    bytes.push(((v(s[i]) << 18) | (v(s[i + 1]) << 12)) >> 16);
  } else if (rem === 3) {
    const n = (v(s[i]) << 18) | (v(s[i + 1]) << 12) | (v(s[i + 2]) << 6);
    bytes.push((n >> 16) & 255, (n >> 8) & 255);
  }
  return bytes;
}

/** Encode a selection as a base64url bitmask over the name-sorted repo list. */
export function encodeRepoMask(
  allSorted: string[],
  selected: Iterable<string>,
): string {
  const sel = new Set(selected);
  const bytes = new Array<number>(Math.ceil(allSorted.length / 8)).fill(0);
  allSorted.forEach((name, i) => {
    if (sel.has(name)) bytes[i >> 3] |= 1 << (i & 7);
  });
  return bytesToB64url(bytes);
}

/** Decode a base64url bitmask back to repo names against the name-sorted list. */
export function decodeRepoMask(allSorted: string[], mask: string): string[] {
  const bytes = b64urlToBytes(mask);
  const out: string[] = [];
  allSorted.forEach((name, i) => {
    if ((bytes[i >> 3] ?? 0) & (1 << (i & 7))) out.push(name);
  });
  return out;
}
