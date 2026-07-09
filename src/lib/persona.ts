/**
 * Classify a developer's commit pattern into a shareable persona + superlative —
 * the identity hook ("My code inkblot says I'm Clockwork ⏰ — what's yours?").
 *
 * Pure and source-agnostic: it works from per-bin totals so it's reusable on the
 * server (chart subtitle / OG card) and the client (share text).
 *
 * Timezone honesty: GitHub normalises commit timestamps to UTC and strips the
 * committer's offset, so the subject's local clock is unknown — an "after
 * midnight" / "9-to-5" label would be fiction (and doubly so for someone who
 * changes timezone during the window). These personas therefore describe the
 * SHAPE of the rhythm — how tight the daily window is, weekend share, single-day
 * bursts — which is invariant to whatever timezone the subject was actually in.
 */
export interface Persona {
  persona: string;
  emoji: string;
  /** Short superlative, no emoji (safe to render in the matplotlib chart). */
  superlative: string;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

interface PersonaInput {
  start: number;
  stepHours: number;
  /** Commits per bin (sum across repos). */
  total: number[];
}

// `d` is always `sum`, which is > 0 at every call site (each pct() call is past
// the `sum === 0` early return below). The 0-fallback is a defensive guard kept
// so a future caller can't divide by zero — provably unreachable today, so its
// branch is exempted from the coverage gate rather than removed (defense-in-depth
// over coverage purism).
/* v8 ignore next */
const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : 0);

/**
 * Tightest daily window (in whole hours, wrapping past midnight) that holds at
 * least 80% of commits. Only the WIDTH matters, never where it sits — that is
 * what makes it timezone-invariant: shifting every commit by a fixed offset
 * moves the window but not its width.
 */
function tightestDailyWindow(
  hourOfDay: number[],
  sum: number,
): { width: number; count: number } {
  const target = 0.8 * sum;
  let best = { width: 24, count: sum };
  for (let s = 0; s < 24; s++) {
    let acc = 0;
    for (let w = 1; w <= 24; w++) {
      acc += hourOfDay[(s + w - 1) % 24];
      if (acc >= target) {
        if (w < best.width) best = { width: w, count: acc };
        break;
      }
    }
  }
  return best;
}

export function classifyPersona({
  start,
  stepHours,
  total,
}: PersonaInput): Persona {
  const stepMs = stepHours * HOUR_MS;
  const hourOfDay = new Array<number>(24).fill(0);
  const dayCount = new Map<number, number>();
  let sum = 0;
  let weekendN = 0;

  for (let i = 0; i < total.length; i++) {
    const c = total[i];
    if (!c) continue;
    sum += c;
    const t = start + i * stepMs;
    const d = new Date(t);
    // Hour/day are read in UTC — the only frame we have. Personas depend on the
    // window WIDTH and weekend share, not on which UTC hour the window sits at.
    const h = d.getUTCHours();
    const dow = d.getUTCDay(); // 0 = Sun … 6 = Sat
    hourOfDay[h] += c;
    const day = Math.floor(t / DAY_MS);
    dayCount.set(day, (dayCount.get(day) ?? 0) + c);
    if (dow === 0 || dow === 6) weekendN += c;
  }

  if (sum === 0) {
    return {
      persona: "Blank Canvas",
      emoji: "🖊️",
      superlative: "no commits in this window yet",
    };
  }

  if (weekendN / sum >= 0.4) {
    return {
      persona: "Weekend Warrior",
      emoji: "🛠️",
      superlative: `${pct(weekendN, sum)}% of commits on weekends`,
    };
  }

  const busiestDay = Math.max(...dayCount.values());
  if (busiestDay / sum >= 0.4) {
    return {
      persona: "The Sprinter",
      emoji: "⚡",
      superlative: `${pct(busiestDay, sum)}% of commits in a single day`,
    };
  }

  const activeHours = hourOfDay.filter((c) => c > 0).length;
  const win = tightestDailyWindow(hourOfDay, sum);

  if (win.width >= 16) {
    return {
      persona: "Around the Clock",
      emoji: "🌍",
      superlative: `commits across ${activeHours} of 24 hours — no fixed schedule`,
    };
  }
  if (win.width <= 8) {
    return {
      persona: "Clockwork",
      emoji: "⏰",
      superlative: `${pct(win.count, sum)}% within a ${win.width}-hour daily window`,
    };
  }
  return {
    persona: "The Marathoner",
    emoji: "🐢",
    superlative: `steady across ${dayCount.size} days`,
  };
}
