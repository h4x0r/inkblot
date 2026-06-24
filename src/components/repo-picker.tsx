"use client";

import { Check, ChevronsUpDown, Lock } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface RepoInfo {
  name: string;
  total: number;
  private?: boolean;
}

interface RepoPickerProps {
  repos: RepoInfo[];
  selected: Set<string>;
  onToggle: (name: string) => void;
  onAll: () => void;
  onNone: () => void;
}

export function RepoPicker({
  repos,
  selected,
  onToggle,
  onAll,
  onNone,
}: RepoPickerProps) {
  const [open, setOpen] = useState(false);
  const count = selected.size;
  const label =
    count === repos.length
      ? "All repos"
      : count === 0
        ? "No repos"
        : `${count} of ${repos.length} repos`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            aria-expanded={open}
            className="w-[220px] justify-between"
          />
        }
      >
        {label}
        <ChevronsUpDown className="size-4 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Filter repos…" />
          <div className="flex items-center justify-between border-b px-2 py-1.5">
            <span className="text-muted-foreground text-xs">{label}</span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={onAll}
              >
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={onNone}
              >
                None
              </Button>
            </div>
          </div>
          <CommandList>
            <CommandEmpty>No repos found.</CommandEmpty>
            <CommandGroup>
              {repos.map((repo) => {
                const on = selected.has(repo.name);
                return (
                  <CommandItem
                    key={repo.name}
                    value={repo.name}
                    onSelect={() => onToggle(repo.name)}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Check
                        className={cn(
                          "size-4 shrink-0",
                          on ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{repo.name}</span>
                      {repo.private && (
                        <Lock className="text-muted-foreground size-3 shrink-0" />
                      )}
                    </span>
                    <Badge
                      variant="secondary"
                      className="font-mono text-[10px]"
                    >
                      {repo.total.toLocaleString()}
                    </Badge>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
