import { buildActivityResponse } from "@/lib/activity-response";
import { audit } from "@/lib/audit";
import { fetchPublicActivity, isValidGitHubUsername } from "@/lib/github";

// Public, unauthenticated activity for the /u explorer — same shape as
// /api/activity but sourced from public events only (no private repos).
export const maxDuration = 60;

// The series can be large for prolific users, but it's public data and the
// explorer needs the full series to re-render windows client-side. Cache at the
// edge so repeat opens of the same /u page are instant.
const CACHE = "public, s-maxage=21600, stale-while-revalidate=86400";

type Params = { params: Promise<{ username: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { username } = await params;
  if (!isValidGitHubUsername(username)) {
    return Response.json({ error: "invalid_username" }, { status: 400 });
  }

  let act;
  try {
    act = await fetchPublicActivity(username);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: "user_not_found", detail: message },
      { status: 404 },
    );
  }

  const body = buildActivityResponse({
    viewer: act.viewer,
    events: act.events,
    sinceDays: act.sinceDays,
    truncated: act.truncated,
    // public events never expose private repo names
  });
  audit({
    event: "public_activity",
    username,
    repos: body.repos.length,
    commits: act.events.length,
    persona: body.persona?.persona ?? "none",
    truncated: body.truncated,
  });

  return Response.json(body, { headers: { "cache-control": CACHE } });
}
