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
  if (sigmaBins <= 0) return values.slice();
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
export function findOnsetIndex(values: number[], opts: OnsetOptions = {}): number {
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
