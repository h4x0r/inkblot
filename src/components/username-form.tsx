"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** No-login entry: type any GitHub username → /u/<username>. The friction-free
 * top of the funnel (sign-in is secondary, only for private repos). */
export function UsernameForm() {
  const router = useRouter();
  const [handle, setHandle] = useState("");

  const go = () => {
    const u = handle.trim().replace(/^@/, "");
    if (u) router.push(`/u/${encodeURIComponent(u)}`);
  };

  return (
    <div className="flex w-full max-w-sm gap-2">
      <Input
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && go()}
        placeholder="your GitHub username"
        aria-label="GitHub username"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="h-11 text-base"
      />
      <Button onClick={go} size="lg" className="shrink-0">
        Plot mine →
      </Button>
    </div>
  );
}
