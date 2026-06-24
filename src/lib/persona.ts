/**
 * Classify a developer's commit pattern into a shareable persona + superlative —
 * the identity hook ("My code inkblot says I'm a Night Owl 🌙 — what's yours?").
 *
 * Pure and source-agnostic: it works from per-bin totals (UTC), so it's reusable
 * on the server (chart subtitle / OG card) and the client (share text).
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

export function classifyPersona({ start, stepHours, total }: PersonaInput): Persona {
  const stepMs = stepHours * HOUR_MS;
  const hourOfDay = new Array<number>(24).fill(0);
  const dayCount = new Map<number, number>();
  let sum = 0;
  let nightN = 0;
  let dawnN = 0;
  let businessN = 0;
  let weekendN = 0;

  for (let i = 0; i < total.length; i++) {
    const c = total[i];
    if (!c) continue;
    sum += c;
    const t = start + i * stepMs;
    const d = new Date(t);
    const h = d.getUTCHours();
    const dow = d.getUTCDay(); // 0 = Sun … 6 = Sat
    const weekend = dow === 0 || dow === 6;

    hourOfDay[h] += c;
    dayCount.set(Math.floor(t / DAY_MS), (dayCount.get(Math.floor(t / DAY_MS)) ?? 0) + c);
    if (weekend) weekendN += c;
    if (h >= 22 || h <= 4) nightN += c;
    else if (h >= 5 && h <= 8) dawnN += c;
    else if (h >= 9 && h <= 17 && !weekend) businessN += c;
  }

  if (sum === 0) {
    return { persona: "Blank Canvas", emoji: "🖊️", superlative: "no commits in this window yet" };
  }

  const busiestHour = hourOfDay.indexOf(Math.max(...hourOfDay));
  const at = `busiest at ${busiestHour}:00`;

  if (nightN / sum >= 0.3) {
    return {
      persona: "Night Owl",
      emoji: "🌙",
      superlative: `${pct(nightN, sum)}% of commits after midnight · ${at}`,
    };
  }
  if (weekendN / sum >= 0.4) {
    return {
      persona: "Weekend Warrior",
      emoji: "🛠️",
      superlative: `${pct(weekendN, sum)}% of commits on weekends · ${at}`,
    };
  }
  if (dawnN / sum >= 0.3) {
    return {
      persona: "Dawn Patrol",
      emoji: "🌅",
      superlative: `${pct(dawnN, sum)}% of commits before 9am · ${at}`,
    };
  }
  if (businessN / sum >= 0.55) {
    return {
      persona: "9-to-5 Machine",
      emoji: "☕",
      superlative: `${pct(businessN, sum)}% in business hours · ${at}`,
    };
  }

  const busiestDay = Math.max(...dayCount.values());
  if (busiestDay / sum >= 0.4) {
    return {
      persona: "The Sprinter",
      emoji: "⚡",
      superlative: `${pct(busiestDay, sum)}% of commits in a single day · ${at}`,
    };
  }
  return {
    persona: "The Marathoner",
    emoji: "🐢",
    superlative: `steady across ${dayCount.size} days · ${at}`,
  };
}
