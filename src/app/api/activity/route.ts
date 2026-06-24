import { auth } from "@/auth";
import { buildActivityResponse } from "@/lib/activity-response";
import { audit } from "@/lib/audit";
import { fetchCommitEvents, getViewer } from "@/lib/github";

// Fetching a developer's commit history can take a few seconds; Fluid Compute
// gives us the headroom.
export const maxDuration = 60;

export async function GET() {
  const session = await auth();
  const token = session?.accessToken;
  if (!token) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let viewer, events, truncated, sinceDays, privateRepos;
  try {
    viewer = await getViewer(token);
    ({ events, truncated, sinceDays, privateRepos } = await fetchCommitEvents(
      token,
      viewer.login,
    ));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("activity: github fetch failed:", message);
    return Response.json(
      { error: "github_fetch_failed", detail: message },
      { status: 502 },
    );
  }

  const body = buildActivityResponse({
    viewer,
    events,
    sinceDays,
    truncated,
    privateRepos,
  });
  audit({
    event: "activity",
    login: viewer.login,
    repos: body.repos.length,
    commits: events.length,
    lookbackDays: sinceDays,
    truncated: body.truncated,
    persona: body.persona?.persona ?? "none",
  });
  return Response.json(body);
}
