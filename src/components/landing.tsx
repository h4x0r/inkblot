import { Sparkles } from "lucide-react";
import Image from "next/image";
import { doSignIn } from "@/app/actions";
import { Button } from "@/components/ui/button";

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

export function Landing() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-5xl flex-col items-center gap-10">
        <div className="flex flex-col items-center gap-5 text-center">
          <span className="text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <Sparkles className="size-3.5" />a little pat on the back for the
            grind
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            your commits, <span className="text-primary">as art</span>
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg text-pretty">
            Sign in with GitHub and watch your activity bloom into a symmetric
            streamgraph — a Rorschach inkblot of every late night you shipped.
          </p>

          <form action={doSignIn}>
            <Button type="submit" size="lg" className="gap-2 text-base">
              <GitHubMark className="size-5" />
              Sign in with GitHub
            </Button>
          </form>
          <p className="text-muted-foreground/70 font-mono text-xs">
            read-only · we render, we don&apos;t store your code
          </p>
        </div>

        <div className="ring-border/60 bg-card/40 w-full overflow-hidden rounded-xl border shadow-2xl ring-1">
          <Image
            src="/sample-inkblot.png"
            alt="Sample commit-activity streamgraph"
            width={2240}
            height={1120}
            priority
            className="h-auto w-full"
          />
        </div>
      </div>
    </main>
  );
}
