"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { buildRenderPayload, type ViewData } from "@/lib/inkblot-view";

export interface RendererData extends ViewData {
  empty: boolean;
  viewer: { login: string; avatarUrl: string | null };
  persona?: { persona: string; emoji: string; superlative: string } | null;
}

/**
 * The shared "draw the inkblot" machinery for both the authed dashboard and the
 * public /u explorer: POST the current selection+window to /api/render, debounce
 * so dragging the slider feels smooth, abort superseded requests, and hand back
 * an object-URL the caller drops into an <img>. Both screens build the exact
 * same payload from their data, so it lives here once.
 */
export function useInkblotRenderer(
  data: RendererData | null,
  selected: Set<string>,
  range: [number, number],
): { imgUrl: string | null; busy: boolean } {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const urlRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const render = useCallback(async () => {
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

  // debounce re-renders so dragging the slider feels smooth, not chattery
  useEffect(() => {
    if (!data || data.empty) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(render, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [render, data]);

  // revoke the last object URL on unmount
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  return { imgUrl, busy };
}
