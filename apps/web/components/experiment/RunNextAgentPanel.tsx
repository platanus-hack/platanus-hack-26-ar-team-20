"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FastForward,
  FlaskConical,
  GitPullRequest,
  Lightbulb,
  Microscope,
  RefreshCcw,
  Rocket,
  Scissors,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  type AgentActionResult,
  type AgentName,
  runArchitectCompose,
  runArchitectConsolidate,
  runDemoReset,
  runDirector,
  runFastForward,
  runLab,
  runWitness,
} from "@/lib/agent-actions";
import { RunAllModal } from "@/components/experiment/RunAllModal";

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

type ButtonSpec = {
  agent: AgentName;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: "default" | "outline";
  visible: boolean;
  run: () => Promise<AgentActionResult>;
};

export function RunNextAgentPanel({
  experimentRowId,
  experimentSlug,
  orgPath,
  status,
  hasProblem,
  hasDesign,
  hasPrUrl,
  hasResults,
  fastForwarded,
  fastForwardEnabled,
  problem,
  pendingAgent,
  onAgentChange,
}: RunNextAgentPanelProps) {
  const [, startTransition] = useTransition();
  const router = useRouter();
  const [runAllOpen, setRunAllOpen] = useState(false);

  const buttons: ButtonSpec[] = [
    {
      agent: "lab",
      label: "Run Lab",
      icon: FlaskConical,
      variant: "outline",
      visible: hasProblem && !hasDesign,
      run: () => runLab(experimentRowId, problem, orgPath),
    },
    {
      agent: "architect-compose",
      label: "Run Architect",
      icon: GitPullRequest,
      variant: "outline",
      visible: hasDesign && !hasPrUrl,
      run: () => runArchitectCompose(experimentRowId, orgPath),
    },
    {
      agent: "fast-forward",
      label: "Fast-forward 7d",
      icon: FastForward,
      variant: "default",
      visible: fastForwardEnabled && status === "running" && !fastForwarded,
      run: () => runFastForward(experimentSlug, orgPath),
    },
    {
      agent: "witness",
      label: "Run Witness",
      icon: Microscope,
      variant: "default",
      visible: status === "running" && fastForwarded && !hasResults,
      run: () => runWitness(experimentSlug, orgPath),
    },
    {
      agent: "director",
      label: "Run Director",
      icon: Rocket,
      variant: "default",
      visible: hasResults && status !== "shipped" && status !== "consolidated",
      run: () => runDirector(experimentSlug, orgPath),
    },
    {
      agent: "architect-consolidate",
      label: "Consolidate",
      icon: Scissors,
      variant: "default",
      visible: status === "shipped",
      run: () => runArchitectConsolidate(experimentSlug, orgPath),
    },
  ];

  const visibleButtons = buttons.filter((b) => b.visible);

  const extractPrUrl = (data: unknown): string | null => {
    if (!data || typeof data !== "object") return null;
    const url = (data as { pr_url?: unknown }).pr_url;
    return typeof url === "string" && url.startsWith("http") ? url : null;
  };

  const trigger = (spec: ButtonSpec) => {
    if (pendingAgent !== null) return;
    onAgentChange(spec.agent);
    startTransition(async () => {
      const result = await spec.run();
      if (result.ok) {
        const prUrl = extractPrUrl(result.data);
        if (prUrl) {
          toast.success(`${spec.label} ✓`, {
            description: prUrl,
            action: {
              label: "Open PR",
              onClick: () => window.open(prUrl, "_blank", "noopener"),
            },
            duration: 8000,
          });
        } else {
          toast.success(`${spec.label} ✓`);
        }
      } else {
        toast.error(`${spec.label} failed: ${result.error}`, {
          duration: 10000,
        });
      }
      router.refresh();
      onAgentChange(null);
    });
  };

  const triggerReset = () => {
    if (pendingAgent !== null) return;
    startTransition(async () => {
      const result = await runDemoReset(orgPath);
      if (result.ok) {
        toast.success("Experiment reset");
        // Reopen the "reading the repo" intro on next dashboard visit and
        // bounce there so the user re-enters the flow from the top.
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("helix:welcomed");
        }
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
    <div className="space-y-3 rounded-lg border bg-background p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Run next agent</h2>
        </div>
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
      </div>

      <Button
        className="w-full"
        size="default"
        onClick={() => setRunAllOpen(true)}
        disabled={pendingAgent !== null}
      >
        <Zap className="h-4 w-4" />
        Run full loop
        <span className="text-xs opacity-70">(~30s)</span>
      </Button>

      <p className="text-xs text-muted-foreground">
        O ejecutá los agentes uno por uno:
      </p>
      <div className="flex flex-wrap gap-2">
        {visibleButtons.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nada para correr. Hacé Reset para reiniciar el experimento, o
            esperá a que llegue un evento externo.
          </p>
        ) : (
          visibleButtons.map((spec) => {
            const Icon = spec.icon;
            const disabled = pendingAgent !== null;
            return (
              <Button
                key={spec.agent}
                size="sm"
                variant={spec.variant}
                onClick={() => trigger(spec)}
                disabled={disabled}
              >
                <Icon className="h-3.5 w-3.5" />
                {spec.label}
              </Button>
            );
          })
        )}
      </div>

      <RunAllModal
        experimentRowId={experimentRowId}
        experimentSlug={experimentSlug}
        orgPath={orgPath}
        open={runAllOpen}
        onOpenChange={setRunAllOpen}
      />
    </div>
  );
}
