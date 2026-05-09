"use client";

import { Loader2 } from "lucide-react";
import type { AgentName } from "@/lib/agent-actions";

const COPY: Record<AgentName, string> = {
  brief: "Brief is interpreting your problem...",
  lab: "Lab is designing variants...",
  "architect-compose": "Architect is composing the multivariate PR...",
  "fast-forward": "Fast-forwarding 7 days of traffic...",
  witness: "Witness is computing posteriors...",
  director: "Director is applying policy...",
  "architect-consolidate": "Architect is cleaning up the codebase...",
};

export function AgentRunIndicator({ agent }: { agent: AgentName | null }) {
  if (!agent) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border bg-blue-50 px-3 py-2 text-sm text-blue-900 shadow-sm">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="font-medium">Helix is thinking</span>
      <span className="text-blue-900/80">· {COPY[agent]}</span>
    </div>
  );
}
