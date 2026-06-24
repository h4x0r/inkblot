import { parseChartParams } from "@/lib/activity";
import { buildActivityResponse } from "@/lib/activity-response";
import { resolveView } from "@/lib/inkblot-view";
import { audit } from "@/lib/audit";
import { fetchPublicActivity, isValidGitHubUsername } from "@/lib/github";

export const maxDuration = 60;

// On-demand render; cache hard at the edge so repeat/profile-README hits are
// instant and only the cold render is slow. Regenerable — never stored.
const CACHE = "public, s-maxage=21600, stale-while-revalidate=86400";
const HOUR_MS = 3_600_000;

function appOrigin(req: Request): string {
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/+$/, "");
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

type Params = { params: Promise<{ username: string }> };

export async function GET(req: Request, { params }: Params) {
  const { username } = await params;
  if (!isValidGitHubUsername(username)) {
    return new Response("invalid username", { status: 400 });
  }

  let act;
  try {
    act = await fetchPublicActivity(username);
  } catch {
    return new Response("user not found", { status: 404 });
  }

  let payload: Record<string, unknown>;
  let personaName = "none";
  if (act.events.length === 0) {
    // never break a README image — render a clear placeholder
    payload = {
      start: Date.now() - 7 * 24 * HOUR_MS,
      step_hours: 24,
      series: { " ": [1, 1, 1, 1, 1, 1, 1] },
      title: `${act.viewer.login} — no public commits in the last year`,
      subtitle: "sign in at the app to include private repos",
      avatar_url: act.viewer.avatarUrl ?? undefined,
    };
  } else {
    // Same shaping as /api/u and /api/activity, then resolve the URL params to a
    // selection + window with the same logic the explorer uses (one source).
    const d = buildActivityResponse({
      viewer: act.viewer,
      events: act.events,
      sinceDays: act.sinceDays,
      truncated: act.truncated,
    });
    personaName = d.persona?.persona ?? "none";
    const { selected, window } = resolveView(
      d,
      parseChartParams(new URL(req.url).searchParams),
    );
    payload = {
      start: d.start,
      step_hours: d.stepHours,
      series: d.series,
      selected,
      window,
      title: `${act.viewer.login}'s GitHub Activity History`,
      subtitle: d.persona
        ? `${d.persona.persona} · ${d.persona.superlative}`
        : undefined,
      persona_emoji: d.persona?.emoji,
      avatar_url: act.viewer.avatarUrl ?? undefined,
    };
  }

  audit({
    event: "public_render",
    username,
    commits: act.events.length,
    persona: personaName,
    truncated: act.truncated,
  });

  const res = await fetch(`${appOrigin(req)}/api/render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error(`u/${username}/inkblot.png: render failed (${res.status})`);
    return new Response("render failed", { status: 502 });
  }

  return new Response(await res.arrayBuffer(), {
    headers: { "content-type": "image/png", "cache-control": CACHE },
  });
}
