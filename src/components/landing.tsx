import { Sparkles } from "lucide-react";
import Image from "next/image";
import { PlotCta } from "@/components/plot-cta";

export function Landing() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-5xl flex-col items-center gap-10">
        <div className="flex flex-col items-center gap-5 text-center">
          <span className="font-mono text-sm font-semibold tracking-tight">
            Inkblot
          </span>
          <span className="text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <Sparkles className="size-3.5" />a little pat on the back for the
            grind
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            your commits, <span className="text-primary">as art</span>
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg text-pretty">
            Type a GitHub username and watch a year of commits bloom into a
            symmetric streamgraph — a Rorschach inkblot of every late night
            shipped. No login needed.
          </p>

          <PlotCta />
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
