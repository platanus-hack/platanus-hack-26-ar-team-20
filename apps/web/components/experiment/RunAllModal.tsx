"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type AgentActionResult,
  runArchitectCompose,
  runArchitectConsolidate,
  runDemoReset,
  runDirector,
  runFastForward,
  runFastForwardShipped,
  runLab,
  runWitness,
} from "@/lib/agent-actions";

type StepKey =
  | "reset"
  | "lab"
  | "compose"
  | "ff_started"
  | "witness"
  | "director"
  | "ff_shipped"
  | "consolidate";

type StepStatus = "idle" | "running" | "done" | "error" | "skipped";

type StepConfig = {
  key: StepKey;
  agentLabel: string;
  title: string;
  description: string;
};

const STEPS: StepConfig[] = [
  {
    key: "reset",
    agentLabel: "Helix",
    title: "Resetting demo state",
    description:
      "Limpia agent_runs, decisions y restaura el experimento al estado 'designing' inicial.",
  },
  {
    key: "lab",
    agentLabel: "Lab",
    title: "Lab is designing variants",
    description:
      "Diseñando 4 variantes (recall · cross_sell · urgency) + control con tráfico 25/25/25/25.",
  },
  {
    key: "compose",
    agentLabel: "Architect",
    title: "Architect is composing the multivariate PR",
    description:
      "Abriendo PR en JoaquinGiorgis/helix-demo-saas y creando feature flag multivariante en PostHog.",
  },
  {
    key: "ff_started",
    agentLabel: "Helix",
    title: "Fast-forwarding observation window",
    description:
      "Comprimo 7 días de tráfico para que Witness vea la muestra al instante (solo en modo demo).",
  },
  {
    key: "witness",
    agentLabel: "Witness",
    title: "Witness is computing posteriors",
    description:
      "Bayesian Thompson sampling sobre cada arm + check de guardrails (refund, support, AOV).",
  },
  {
    key: "director",
    agentLabel: "Director",
    title: "Director is applying policy",
    description:
      "Ejecutando ship_winner contra PostHog (winner a 100%, perdedoras a 0%) y registrando la decisión.",
  },
  {
    key: "ff_shipped",
    agentLabel: "Helix",
    title: "Fast-forwarding consolidation grace",
    description:
      "Comprimo los 7 días de gracia post-ship antes del cleanup (solo en modo demo).",
  },
  {
    key: "consolidate",
    agentLabel: "Architect",
    title: "Architect is cleaning up the codebase",
    description:
      "PR de cleanup: borra archivos de variantes perdedoras, mueve la ganadora fuera de lib/experiments/, e inlina el switch site.",
  },
];

type StepResult = {
  status: StepStatus;
  prUrl?: string | null;
  error?: string | null;
};

type RunAllModalProps = {
  experimentRowId: string;
  experimentSlug: string;
  orgPath: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function extractPrUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const url = (data as { pr_url?: unknown }).pr_url;
  return typeof url === "string" && url.startsWith("http") ? url : null;
}

export function RunAllModal({
  experimentRowId,
  experimentSlug,
  orgPath,
  open,
  onOpenChange,
}: RunAllModalProps) {
  const router = useRouter();
  const [results, setResults] = useState<Record<StepKey, StepResult>>(
    () =>
      Object.fromEntries(
        STEPS.map((s) => [s.key, { status: "idle" } as StepResult])
      ) as Record<StepKey, StepResult>
  );
  const [currentStep, setCurrentStep] = useState<StepKey | null>(null);
  const [aborted, setAborted] = useState(false);
  const [done, setDone] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasStartedRef = useRef(false);

  // Reset state every time the modal opens.
  useEffect(() => {
    if (!open) {
      hasStartedRef.current = false;
      return;
    }
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    setResults(
      Object.fromEntries(
        STEPS.map((s) => [s.key, { status: "idle" } as StepResult])
      ) as Record<StepKey, StepResult>
    );
    setCurrentStep(null);
    setAborted(false);
    setDone(false);
    setElapsedMs(0);
    startedAtRef.current = Date.now();

    if (tickerRef.current) clearInterval(tickerRef.current);
    tickerRef.current = setInterval(() => {
      if (startedAtRef.current) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 250);

    void runFlow();

    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setStep = (key: StepKey, patch: Partial<StepResult>) =>
    setResults((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));

  const execStep = async <T,>(
    key: StepKey,
    runner: () => Promise<AgentActionResult>
  ): Promise<T | null> => {
    setCurrentStep(key);
    setStep(key, { status: "running", error: null });
    const result = await runner();
    if (!result.ok) {
      setStep(key, { status: "error", error: result.error });
      return null;
    }
    const prUrl = extractPrUrl(result.data);
    setStep(key, { status: "done", prUrl, error: null });
    return result.data as T;
  };

  const runFlow = async () => {
    try {
      // 0. Reset — clean slate, restores the seed experiment to 'designing'.
      const reset = await execStep("reset", () => runDemoReset(orgPath));
      if (!reset) return abort();

      // 1. Lab
      const lab = await execStep("lab", () =>
        runLab(experimentRowId, undefined, orgPath)
      );
      if (!lab) return abort();

      // 2. Architect compose
      const compose = await execStep("compose", () =>
        runArchitectCompose(experimentRowId, orgPath)
      );
      if (!compose) return abort();

      // 3. Fast-forward started_at
      const ff1 = await execStep("ff_started", () =>
        runFastForward(experimentSlug, orgPath)
      );
      if (!ff1) return abort();

      // 4. Witness
      const witness = await execStep("witness", () =>
        runWitness(experimentSlug, orgPath)
      );
      if (!witness) return abort();

      // 5. Director
      const director = await execStep("director", () =>
        runDirector(experimentSlug, orgPath)
      );
      if (!director) return abort();

      // 6. Fast-forward shipped_at (the experiments-router /fast-forward
      // only handles started_at; for shipped_at we call /demo/fast-forward
      // with target=shipped_at via runFastForwardShipped).
      const ff2 = await execStep("ff_shipped", () =>
        runFastForwardShipped(experimentSlug, orgPath)
      );
      if (!ff2) return abort();

      // 7. Architect consolidate
      const consolidate = await execStep("consolidate", () =>
        runArchitectConsolidate(experimentSlug, orgPath)
      );
      if (!consolidate) return abort();

      setCurrentStep(null);
      setDone(true);
      router.refresh();
    } finally {
      if (tickerRef.current) clearInterval(tickerRef.current);
    }
  };

  const abort = () => {
    setAborted(true);
    setCurrentStep(null);
    if (tickerRef.current) clearInterval(tickerRef.current);
  };

  const handleClose = () => {
    onOpenChange(false);
    router.refresh();
  };

  const canClose = done || aborted;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !canClose) return; // disable close while running
        onOpenChange(nextOpen);
        if (!nextOpen) router.refresh();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Helix is running the full loop
          </DialogTitle>
          <DialogDescription>
            Brief → Lab → Architect → Witness → Director → Consolidate. Tarda
            ~30s con datos cacheados (modo demo).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono">
            {(elapsedMs / 1000).toFixed(1)}s elapsed
          </span>
          {done && (
            <span className="font-medium text-green-700">Loop completed ✓</span>
          )}
          {aborted && (
            <span className="font-medium text-red-700">Loop aborted ✗</span>
          )}
        </div>

        <ol className="space-y-3">
          {STEPS.map((step) => {
            const r = results[step.key];
            const isCurrent = currentStep === step.key;
            return (
              <li
                key={step.key}
                className={cn(
                  "rounded-md border p-3 transition-colors",
                  isCurrent && "border-blue-300 bg-blue-50/50",
                  r.status === "done" && "border-green-200 bg-green-50/40",
                  r.status === "error" && "border-red-200 bg-red-50/40"
                )}
              >
                <div className="flex items-start gap-3">
                  <StatusIcon status={r.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        {step.agentLabel}
                      </span>
                      <span className="text-sm font-medium">{step.title}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {step.description}
                    </p>
                    {r.prUrl && (
                      <a
                        href={r.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                      >
                        Open PR
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {r.error && (
                      <p className="mt-2 text-xs text-red-700">
                        {r.error}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="flex justify-end">
          <Button
            variant={canClose ? "default" : "outline"}
            onClick={handleClose}
            disabled={!canClose}
          >
            {canClose ? "Cerrar" : "Corriendo..."}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === "running")
    return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600" />;
  if (status === "done")
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />;
  if (status === "error")
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />;
  return <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />;
}

