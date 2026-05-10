"use client";

import { Sparkles } from "lucide-react";
import type { AgentName } from "@/lib/agent-actions";

const COPY: Record<AgentName, string> = {
  brief: "Brief is interpreting your problem",
  lab: "Lab is designing variants",
  "architect-compose": "Architect is composing the multivariate PR",
  "fast-forward": "Fast-forwarding 7 days of traffic",
  witness: "Witness is computing posteriors",
  director: "Director is applying policy",
  "architect-consolidate": "Architect is cleaning up the codebase",
};

export function AgentRunIndicator({ agent }: { agent: AgentName | null }) {
  if (!agent) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg border border-accent/20 bg-accent-soft/60 px-3.5 py-2.5 text-[13px] backdrop-blur-sm"
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
        <Sparkles className="h-3 w-3" strokeWidth={2} />
        <span
          aria-hidden
          className="absolute inset-0 -z-10 rounded-md bg-accent/30 blur-md"
        />
      </span>
      <span className="font-medium text-foreground">Helix is thinking</span>
      <span className="hidden text-muted-foreground/50 sm:inline">·</span>
      <span className="caret-blink truncate text-foreground/80">
        {COPY[agent]}
      </span>
    </div>
  );
}
