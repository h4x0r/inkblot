import Link from "next/link";
import { doSignIn } from "@/app/actions";
import { UsernameForm } from "@/components/username-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEMOS = ["torvalds", "gaearon", "antirez", "sindresorhus"];

// lucide-react v1 dropped brand glyphs, so the GitHub mark is inlined.
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.43 7.86 10.96.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.73 1.27 3.4.97.1-.76.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.42.36.8 1.08.8 2.18v3.23c0 .31.21.67.8.56A11.53 11.53 0 0 0 23.5 12.02C23.5 5.74 18.27.5 12 .5Z" />
    </svg>
  );
}

/** The friction-free "plot your own" call-to-action, shared by the landing
 * hero and the /s share page so the two stay identical: type a username
 * (no login) → one-click demos → optional sign-in for private repos. */
export function PlotCta() {
  return (
    <>
      {/* primary, friction-free: no login */}
      <UsernameForm />

      {/* one-click demos — see it without typing */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <span className="text-muted-foreground">or see a demo:</span>
        {DEMOS.map((u) => (
          <Link
            key={u}
            href={`/u/${u}`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "font-mono",
            )}
          >
            @{u}
          </Link>
        ))}
      </div>

      {/* secondary: sign in only to include private repos */}
      <form action={doSignIn}>
        <button
          type="submit"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm"
        >
          <GitHubMark className="size-4" />
          or sign in to include your private repos
        </button>
      </form>
      <p className="text-muted-foreground/70 font-mono text-xs">
        public data only · read-only · we render, we don&apos;t store your code
      </p>
    </>
  );
}
