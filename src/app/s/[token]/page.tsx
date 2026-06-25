import type { Metadata } from "next";
import Link from "next/link";
import { LinkedInMark, XMark } from "@/components/brand-icons";
import { UsernameForm } from "@/components/username-form";
import { buttonVariants } from "@/components/ui/button";
import { decodeShare } from "@/lib/share";
import { cn } from "@/lib/utils";

const APP_URL =
  process.env.AUTH_URL ?? "https://inkblot.securityronin.com";

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const d = decodeShare(token);
  if (!d) return { title: "Inkblot" };
  const description =
    "Made with Inkblot — sign in with GitHub and reveal your own code inkblot.";
  return {
    title: d.t,
    description,
    openGraph: {
      type: "website",
      title: d.t,
      description,
      images: [{ url: d.u, width: 2240, height: 1120, alt: d.t }],
    },
    twitter: {
      card: "summary_large_image",
      title: d.t,
      description,
      images: [d.u],
    },
  };
}

export default async function SharePage({ params }: Params) {
  const { token } = await params;
  const d = decodeShare(token);

  if (!d) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-muted-foreground">
          That share link is invalid or expired.
        </p>
        <Link href="/" className={cn(buttonVariants())}>
          Go to Inkblot
        </Link>
      </main>
    );
  }

  const pageUrl = `${APP_URL}/s/${token}`;
  const xHref = `https://x.com/intent/post?text=${encodeURIComponent(
    "My GitHub activity, plotted 📈",
  )}&url=${encodeURIComponent(pageUrl)}`;
  const liHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    pageUrl,
  )}`;

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-6 py-12">
      <div className="ring-border/60 bg-card/40 w-full max-w-5xl overflow-hidden rounded-xl border shadow-2xl ring-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={d.u} alt={d.t} className="h-auto w-full" />
      </div>

      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{d.t}</h1>
        <p className="text-muted-foreground max-w-md text-pretty">
          Made with Inkblot. Type a GitHub username and watch a year of commits
          bloom into a streamgraph — no login needed.
        </p>

        {/* primary, friction-free: type a username → /u/<username> (no login) */}
        <UsernameForm />

        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href={xHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "gap-2",
            )}
          >
            <XMark className="size-4" /> Share
          </a>
          <a
            href={liHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "gap-2",
            )}
          >
            <LinkedInMark className="size-4" /> Share
          </a>
        </div>
      </div>
    </main>
  );
}
