import type { Metadata } from "next";
import { after } from "next/server";
import Link from "next/link";
import { PublicExplorer } from "@/components/public-explorer";
import { buttonVariants } from "@/components/ui/button";
import { isValidGitHubUsername } from "@/lib/github";
import { cn } from "@/lib/utils";

const APP =
  process.env.AUTH_URL ?? "https://gh-activity-plotter.securityronin.com";

type Search = Record<string, string | string[] | undefined>;
type Params = {
  params: Promise<{ username: string }>;
  searchParams: Promise<Search>;
};

// Carry the explorer's from/to/repos params onto the image + canonical URLs so
// a shared link's OG card matches the exact view the sharer was looking at.
function chartQuery(sp: Search): string {
  const p = new URLSearchParams();
  for (const key of ["from", "to", "repos"]) {
    const v = sp[key];
    if (typeof v === "string" && v) p.set(key, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function generateMetadata({
  params,
  searchParams,
}: Params): Promise<Metadata> {
  const { username } = await params;
  if (!isValidGitHubUsername(username)) return { title: "Inkblot" };
  const q = chartQuery(await searchParams);
  const img = `${APP}/u/${username}/inkblot.png${q}`;
  const title = `${username}'s code inkblot`;
  const description = `What does ${username}'s GitHub activity look like? Made with Inkblot.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: img, width: 2240, height: 1120 }],
    },
    twitter: { card: "summary_large_image", title, description, images: [img] },
  };
}

export default async function PublicInkblotPage({
  params,
  searchParams,
}: Params) {
  const { username } = await params;

  if (!isValidGitHubUsername(username)) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-muted-foreground">
          That isn&apos;t a valid GitHub username.
        </p>
        <Link href="/" className={cn(buttonVariants())}>
          Go to Inkblot
        </Link>
      </main>
    );
  }

  const q = chartQuery(await searchParams);

  // Pre-warm the cached image for this exact view after the response, so the
  // OG scrape (and README embed) hit a warm CDN entry instead of a cold render.
  after(async () => {
    try {
      await fetch(`${APP}/u/${username}/inkblot.png${q}`, { cache: "no-store" });
    } catch {
      // best-effort warm; ignore failures
    }
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="text-primary">{username}</span>&apos;s code inkblot
        </h1>
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "text-muted-foreground",
          )}
        >
          Sign in to include private repos →
        </Link>
      </div>

      <PublicExplorer username={username} />
    </main>
  );
}
