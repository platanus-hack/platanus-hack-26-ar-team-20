"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  type AgentName,
  runDemoReset,
} from "@/lib/agent-actions";

export type RunNextAgentPanelProps = {
  experimentRowId: string;
  experimentSlug: string;
  orgPath: string;
  status: string;
  hasProblem: boolean;
  hasDesign: boolean;
  hasPrUrl: boolean;
  hasResults: boolean;
  fastForwarded: boolean;
  fastForwardEnabled: boolean;
  problem: unknown;
  pendingAgent: AgentName | null;
  onAgentChange: (agent: AgentName | null) => void;
};

export function RunNextAgentPanel({
  orgPath,
  pendingAgent,
}: RunNextAgentPanelProps) {
  const [, startTransition] = useTransition();
  const router = useRouter();

  const triggerReset = () => {
    if (pendingAgent !== null) return;
    startTransition(async () => {
      const result = await runDemoReset(orgPath);
      if (result.ok) {
        toast.success("Experiment reset");
        const orgSlug = orgPath.split("/").filter(Boolean)[0];
        if (orgSlug) {
          router.push(`/${orgSlug}`);
          return;
        }
      } else {
        toast.error(`Reset failed: ${result.error}`);
      }
      router.refresh();
    });
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={triggerReset}
      disabled={pendingAgent !== null}
      title="Reset the experiment back to a clean 'designing' state"
    >
      <RefreshCcw className="h-3.5 w-3.5" />
      Reset
    </Button>
  );
}
