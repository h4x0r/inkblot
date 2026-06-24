"use client";

import type { User } from "next-auth";
import { Download, Loader2, LogOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { doSignOut } from "@/app/actions";
import { RepoPicker, type RepoInfo } from "@/components/repo-picker";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { defaultRepoSelection, HOUR_MS } from "@/lib/activity";
import { cn } from "@/lib/utils";

interface ActivityData {
  viewer: { login: string; name: string | null; avatarUrl: string | null };
  empty: boolean;
  truncated: boolean;
  lookbackDays: number;
  start: number;
  stepHours: number;
  hours: number;
  series: Record<string, number[]>;
  repos: RepoInfo[];
  window: { from: number; to: number };
}

// With a deep history a developer can have 100+ repos; default the chart to the
// busiest repos covering ~90% of commits (capped) so it reads cleanly, and let
// them add more from the repo picker.

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function Dashboard({ user }: { user: User }) {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const urlRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stepMs = (data?.stepHours ?? 1) * HOUR_MS;

  // --- load the heavy activity data once -----------------------------------
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/activity", { signal: ctrl.signal });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.detail || e.error || res.statusText);
        }
        const d: ActivityData = await res.json();
        setData(d);
        setSelected(new Set(defaultRepoSelection(d.repos)));
        if (!d.empty) {
          const from = Math.round(
            (d.window.from - d.start) / (d.stepHours * HOUR_MS),
          );
          const to = Math.round(
            (d.window.to - d.start) / (d.stepHours * HOUR_MS),
          );
          setRange([Math.max(0, from), Math.min(d.hours - 1, to)]);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setLoadError((err as Error).message);
      }
    })();
    return () => ctrl.abort();
  }, []);

  // --- render the inkblot from the current selection + window --------------
  const renderInkblot = useCallback(async () => {
    if (!data || data.empty || selected.size === 0) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    try {
      const from = data.start + range[0] * stepMs;
      const to = data.start + range[1] * stepMs;
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          start: data.start,
          step_hours: data.stepHours,
          series: data.series,
          selected: [...selected],
          window: [from, to],
          title: `${data.viewer.login}'s GitHub Activity History`,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setImgUrl(url);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      toast.error("Couldn't render the chart", {
        description: (err as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }, [data, selected, range, stepMs]);

  // debounce re-renders so dragging the slider feels smooth, not chattery
  useEffect(() => {
    if (!data || data.empty) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(renderInkblot, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [renderInkblot, data]);

  // revoke the last object URL on unmount
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const toggle = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);
  const selectAll = useCallback(() => {
    setSelected(new Set(data?.repos.map((r) => r.name) ?? []));
  }, [data]);
  const selectNone = useCallback(() => setSelected(new Set()), []);

  const rangeLabel = useMemo(() => {
    if (!data || data.empty) return "";
    return `${fmtDate(data.start + range[0] * stepMs)} → ${fmtDate(
      data.start + range[1] * stepMs,
    )}`;
  }, [data, range, stepMs]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-mono text-sm font-semibold tracking-tight">
          GitHub Activity Plotter
        </span>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground hidden text-sm sm:inline">
            {user.name ?? user.email}
          </span>
          <Avatar className="size-7">
            <AvatarImage src={user.image ?? undefined} alt="" />
            <AvatarFallback>{(user.name ?? "?").slice(0, 1)}</AvatarFallback>
          </Avatar>
          <form action={doSignOut}>
            <Button type="submit" variant="ghost" size="icon" title="Sign out">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-6 py-6">
        {loadError ? (
          <Card className="border-destructive/40 text-destructive p-6 text-sm">
            Couldn&apos;t load your activity: {loadError}
          </Card>
        ) : !data ? (
          <LoadingState />
        ) : data.empty ? (
          <Card className="text-muted-foreground p-10 text-center text-sm">
            No commits found for{" "}
            <span className="text-foreground font-mono">
              {data.viewer.login}
            </span>{" "}
            yet. Go ship something. ✨
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <RepoPicker
                repos={data.repos}
                selected={selected}
                onToggle={toggle}
                onAll={selectAll}
                onNone={selectNone}
              />
              <div className="flex min-w-[260px] flex-1 flex-col gap-1">
                <div className="text-muted-foreground flex justify-between font-mono text-xs">
                  <span>{rangeLabel}</span>
                  {busy && (
                    <span className="text-primary inline-flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" /> rendering
                    </span>
                  )}
                </div>
                <Slider
                  min={0}
                  max={data.hours - 1}
                  step={1}
                  value={range}
                  onValueChange={(v) => {
                    const a = Array.isArray(v) ? v : [v, v];
                    setRange([a[0], a[1]]);
                  }}
                  minStepsBetweenValues={1}
                />
              </div>
              {imgUrl && (
                <a
                  href={imgUrl}
                  download="github-activity.png"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "gap-2",
                  )}
                >
                  <Download className="size-4" /> PNG
                </a>
              )}
            </div>

            <p className="text-muted-foreground/70 text-xs">
              Last {Math.round(data.lookbackDays / 30)} months ·{" "}
              {selected.size} of {data.repos.length} repos
              {selected.size < data.repos.length && " — add more in the menu"}
              {data.truncated && " · capped for speed"}
            </p>

            <Card className="overflow-hidden border bg-[#0d1117] p-0">
              <div className="relative aspect-[2/1] w-full">
                {imgUrl ? (
                  // next/image can't take a runtime blob: URL from a POST; a
                  // plain <img> is the right tool for this generated image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={imgUrl}
                    src={imgUrl}
                    alt="Your commit-activity streamgraph"
                    className="animate-in fade-in absolute inset-0 size-full object-contain duration-500"
                  />
                ) : selected.size === 0 ? (
                  <div className="text-muted-foreground absolute inset-0 grid place-items-center text-sm">
                    Pick at least one repo to bloom the chart.
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="text-primary size-6 animate-spin" />
                    <p className="text-muted-foreground text-xs">
                      Rendering your chart…
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

const LOADING_MESSAGES = [
  "Connecting to GitHub…",
  "Fetching your commit history…",
  "Scanning your repositories…",
  "Active accounts have a lot of commits — hang tight…",
  "Binning commits by the hour…",
  "Almost there…",
];

function LoadingState() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setI((p) => Math.min(p + 1, LOADING_MESSAGES.length - 1)),
      4000,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-4">
        <Skeleton className="h-9 w-[220px]" />
        <Skeleton className="h-9 flex-1" />
      </div>
      <Card className="flex aspect-[2/1] w-full flex-col items-center justify-center gap-4 border bg-[#0d1117] p-6 text-center">
        <Loader2 className="text-primary size-8 animate-spin" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Building your activity chart…</p>
          <p
            key={i}
            className="text-muted-foreground animate-in fade-in text-sm duration-500"
          >
            {LOADING_MESSAGES[i]}
          </p>
        </div>
        <div className="bg-muted relative h-1 w-56 overflow-hidden rounded-full">
          <div
            className="bg-primary absolute inset-y-0 left-0 w-1/3 rounded-full"
            style={{ animation: "indeterminate 1.4s ease-in-out infinite" }}
          />
        </div>
        <p className="text-muted-foreground/60 text-xs">
          First load can take ~30–60s for very active accounts. Please wait.
        </p>
      </Card>
    </div>
  );
}
