"use client";

import { Check, Copy, Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LinkedInMark, XMark } from "@/components/brand-icons";
import { RepoPicker, type RepoInfo } from "@/components/repo-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { HOUR_MS, parseChartParams } from "@/lib/activity";
import {
  buildRenderPayload,
  buildShareParams,
  seedView,
} from "@/lib/inkblot-view";
import { cn } from "@/lib/utils";

interface Persona {
  persona: string;
  emoji: string;
  superlative: string;
}

interface ActivityData {
  viewer: { login: string; name: string | null; avatarUrl: string | null };
  empty: boolean;
  truncated: boolean;
  persona?: Persona | null;
  lookbackDays: number;
  start: number;
  stepHours: number;
  hours: number;
  series: Record<string, number[]>;
  repos: RepoInfo[];
  window: { from: number; to: number };
}

const msToInput = (ms: number) => new Date(ms).toISOString().slice(0, 16);
const inputToMs = (v: string) => new Date(`${v}Z`).getTime();

export function PublicExplorer({ username }: { username: string }) {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const urlRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stepMs = (data?.stepHours ?? 1) * HOUR_MS;

  // --- load public activity once, seed state from URL params ----------------
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/u/${username}`, { signal: ctrl.signal });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.detail || e.error || res.statusText);
        }
        const d: ActivityData = await res.json();
        setData(d);
        if (d.empty) return;
        const seed = seedView(
          d,
          parseChartParams(new URLSearchParams(window.location.search)),
        );
        setSelected(new Set(seed.selected));
        setRange(seed.range);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setLoadError((err as Error).message);
      }
    })();
    return () => ctrl.abort();
  }, [username]);

  // --- derive the shareable URL params (omit-when-default) ------------------
  const paramString = useMemo(
    () => (data && !data.empty ? buildShareParams(data, selected, range) : ""),
    [data, range, selected],
  );

  // keep the address bar in sync so a copy/refresh reproduces the view
  useEffect(() => {
    if (!data || data.empty) return;
    const url = paramString
      ? `/u/${username}?${paramString}`
      : `/u/${username}`;
    window.history.replaceState(null, "", url);
  }, [paramString, username, data]);

  // --- live preview render (snappy POST; share uses the cached image route) -
  const renderInkblot = useCallback(async () => {
    if (!data || data.empty || selected.size === 0) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildRenderPayload(data, selected, range, {
            title: `${data.viewer.login}'s GitHub Activity History`,
            subtitle: data.persona
              ? `${data.persona.persona} · ${data.persona.superlative}`
              : undefined,
            personaEmoji: data.persona?.emoji,
            avatarUrl: data.viewer.avatarUrl ?? undefined,
          }),
        ),
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
  }, [data, selected, range]);

  useEffect(() => {
    if (!data || data.empty) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(renderInkblot, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [renderInkblot, data]);

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
  const selectAll = useCallback(
    () => setSelected(new Set(data?.repos.map((r) => r.name) ?? [])),
    [data],
  );
  const selectNone = useCallback(() => setSelected(new Set()), []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = paramString
    ? `${origin}/u/${username}?${paramString}`
    : `${origin}/u/${username}`;
  const imgQuery = paramString ? `?${paramString}` : "";
  const embed = `![${username}'s code inkblot](${origin}/u/${username}/inkblot.png${imgQuery})`;
  const xHref = `https://x.com/intent/post?text=${encodeURIComponent(
    `${username}'s code inkblot 🦇 — what's yours?`,
  )}&url=${encodeURIComponent(shareUrl)}`;
  const liHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    shareUrl,
  )}`;

  const copyEmbed = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(embed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }, [embed]);

  if (loadError) {
    return (
      <Card className="border-destructive/40 text-destructive p-6 text-sm">
        Couldn&apos;t load {username}&apos;s activity: {loadError}
      </Card>
    );
  }
  if (!data) {
    return (
      <Card className="flex aspect-[2/1] w-full flex-col items-center justify-center gap-3 border bg-[#0d1117] p-6 text-center">
        <Loader2 className="text-primary size-7 animate-spin" />
        <p className="text-muted-foreground text-sm">
          Loading {username}&apos;s public activity…
        </p>
        <p className="text-muted-foreground/60 text-xs">
          First load can take ~20–40s for very active accounts.
        </p>
      </Card>
    );
  }
  if (data.empty) {
    return (
      <Card className="text-muted-foreground p-10 text-center text-sm">
        No public commits found for{" "}
        <span className="text-foreground font-mono">{data.viewer.login}</span>{" "}
        in the last year.
      </Card>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5">
      {data.persona && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-lg font-semibold tracking-tight">
            <span className="mr-1">{data.persona.emoji}</span>
            <span className="text-primary">{username}</span> is a{" "}
            <span className="text-primary">{data.persona.persona}</span>
          </span>
          <span className="text-muted-foreground text-sm">
            {data.persona.superlative}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <RepoPicker
          repos={data.repos}
          selected={selected}
          onToggle={toggle}
          onAll={selectAll}
          onNone={selectNone}
        />
        <div className="flex min-w-[280px] flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <input
              type="datetime-local"
              aria-label="From"
              className="border-input bg-background text-foreground rounded-md border px-2 py-1 [color-scheme:dark]"
              min={msToInput(data.start)}
              max={msToInput(data.start + (data.hours - 1) * stepMs)}
              value={msToInput(data.start + range[0] * stepMs)}
              onChange={(e) => {
                if (!e.target.value) return;
                const idx = Math.round(
                  (inputToMs(e.target.value) - data.start) / stepMs,
                );
                setRange([Math.max(0, Math.min(idx, range[1] - 1)), range[1]]);
              }}
            />
            <span className="text-muted-foreground">→</span>
            <input
              type="datetime-local"
              aria-label="To"
              className="border-input bg-background text-foreground rounded-md border px-2 py-1 [color-scheme:dark]"
              min={msToInput(data.start)}
              max={msToInput(data.start + (data.hours - 1) * stepMs)}
              value={msToInput(data.start + range[1] * stepMs)}
              onChange={(e) => {
                if (!e.target.value) return;
                const idx = Math.round(
                  (inputToMs(e.target.value) - data.start) / stepMs,
                );
                setRange([
                  range[0],
                  Math.min(data.hours - 1, Math.max(idx, range[0] + 1)),
                ]);
              }}
            />
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
        <div className="flex items-center gap-2">
          {imgUrl && (
            <a
              href={imgUrl}
              download={`${username}-github-activity.png`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-2",
              )}
            >
              <Download className="size-4" /> PNG
            </a>
          )}
          <a
            href={xHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
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
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-2",
            )}
          >
            <LinkedInMark className="size-4" /> Share
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground/70 grow text-xs">
          Public activity · {selected.size} of {data.repos.length} repos
          {data.truncated && " · capped for speed"} · drag the handles or pick
          dates — the link updates so you can share this exact view
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={copyEmbed}
        >
          {copied ? (
            <Check className="size-4 text-emerald-500" />
          ) : (
            <Copy className="size-4" />
          )}
          Copy README embed
        </Button>
      </div>

      <Card className="overflow-hidden border bg-[#0d1117] p-0">
        <div className="relative aspect-[2/1] w-full">
          {imgUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- runtime blob URL
            <img
              key={imgUrl}
              src={imgUrl}
              alt={`${username}'s commit-activity streamgraph`}
              className="animate-in fade-in absolute inset-0 size-full object-contain duration-500"
            />
          ) : selected.size === 0 ? (
            <div className="text-muted-foreground absolute inset-0 grid place-items-center text-sm">
              Pick at least one repo to bloom the chart.
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <Loader2 className="text-primary size-6 animate-spin" />
              <p className="text-muted-foreground text-xs">Rendering…</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
