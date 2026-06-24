"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Strip a leading @ and surrounding whitespace from a typed handle. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "");
}

/** No-login entry: type any GitHub username → /u/<username>. The friction-free
 * top of the funnel (sign-in is secondary, only for private repos).
 *
 * `compact` is the in-page variant used on a profile to jump to someone else's
 * inkblot; the default is the hero form on the landing page. */
export function UsernameForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [handle, setHandle] = useState("");

  const go = () => {
    const u = normalizeHandle(handle);
    if (u) router.push(`/u/${encodeURIComponent(u)}`);
  };

  return (
    <div className={compact ? "flex w-full max-w-xs gap-2" : "flex w-full max-w-sm gap-2"}>
      <Input
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && go()}
        placeholder={compact ? "check another username…" : "any GitHub username"}
        aria-label="GitHub username"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={compact ? "h-9" : "h-11 text-base"}
      />
      <Button onClick={go} size={compact ? "default" : "lg"} className="shrink-0">
        {compact ? "Go →" : "Plot →"}
      </Button>
    </div>
  );
}
