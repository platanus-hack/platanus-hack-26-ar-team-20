"use client";

import { useTransition } from "react";
import {
  FastForward,
  FlaskConical,
  GitPullRequest,
  Lightbulb,
  Microscope,
  Rocket,
  Scissors,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  type AgentActionResult,
  type AgentName,
  runArchitectCompose,
  runArchitectConsolidate,
  runDirector,
  runFastForward,
  runLab,
  runWitness,
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

  const trigger = (spec: ButtonSpec) => {
    if (pendingAgent !== null) return;
    onAgentChange(spec.agent);
    startTransition(async () => {
      const result = await spec.run();
      if (result.ok) {
        toast.success(`${spec.label} ✓`);
      } else {
        toast.error(`${spec.label} failed: ${result.error}`);
      }
      onAgentChange(null);
    });
  };

  return (
    <div className="space-y-3 rounded-lg border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Run next agent</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Demo controls. Cada botón ejecuta el siguiente agente del flujo.
      </p>
      <div className="flex flex-wrap gap-2">
        {visibleButtons.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nada para correr. El experimento terminó el ciclo o está esperando
            otro evento.
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
    </div>
  );
}
