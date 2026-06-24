"use client";

import { Loader2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";

// datetime-local <-> epoch ms in UTC wall-clock, matching the chart's UTC bins
const msToInput = (ms: number) => new Date(ms).toISOString().slice(0, 16);
const inputToMs = (v: string) => new Date(`${v}Z`).getTime();

/**
 * The from/to calendar inputs + the dual-handle time slider, shared by the
 * dashboard and the /u explorer. Stateless: it reads the current [from, to] bin
 * range and reports changes; the parent owns the range and the rendering.
 */
export function TimeRangeControls({
  start,
  hours,
  stepMs,
  range,
  onChange,
  busy = false,
}: {
  start: number;
  hours: number;
  stepMs: number;
  range: [number, number];
  onChange: (range: [number, number]) => void;
  busy?: boolean;
}) {
  const minInput = msToInput(start);
  const maxInput = msToInput(start + (hours - 1) * stepMs);
  return (
    <div className="flex min-w-[280px] flex-1 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
        <input
          type="datetime-local"
          aria-label="From"
          className="border-input bg-background text-foreground rounded-md border px-2 py-1 [color-scheme:dark]"
          min={minInput}
          max={maxInput}
          value={msToInput(start + range[0] * stepMs)}
          onChange={(e) => {
            if (!e.target.value) return;
            const idx = Math.round(
              (inputToMs(e.target.value) - start) / stepMs,
            );
            onChange([Math.max(0, Math.min(idx, range[1] - 1)), range[1]]);
          }}
        />
        <span className="text-muted-foreground">→</span>
        <input
          type="datetime-local"
          aria-label="To"
          className="border-input bg-background text-foreground rounded-md border px-2 py-1 [color-scheme:dark]"
          min={minInput}
          max={maxInput}
          value={msToInput(start + range[1] * stepMs)}
          onChange={(e) => {
            if (!e.target.value) return;
            const idx = Math.round(
              (inputToMs(e.target.value) - start) / stepMs,
            );
            onChange([
              range[0],
              Math.min(hours - 1, Math.max(idx, range[0] + 1)),
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
        max={hours - 1}
        step={1}
        value={range}
        onValueChange={(v) => {
          const a = Array.isArray(v) ? v : [v, v];
          onChange([a[0], a[1]]);
        }}
        minStepsBetweenValues={1}
      />
    </div>
  );
}
