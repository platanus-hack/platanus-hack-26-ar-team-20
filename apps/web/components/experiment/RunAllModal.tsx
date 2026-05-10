"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Circle,
  ExternalLink,
  Github,
  Loader2,
  Sparkles,
  X,
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
  runDemoReset,
  runDirector,
  runFastForward,
  runLab,
  runWitness,
} from "@/lib/agent-actions";

type StepKey =
  | "reset"
  | "lab"
  | "compose"
  | "ff_started"
  | "witness"
  | "director";

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
    title: "Resetting experiment state",
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
      "Comprimo 7 días de tráfico para que Witness vea la muestra al instante.",
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
      const reset = await execStep("reset", () => runDemoReset(orgPath));
      if (!reset) return abort();

      const lab = await execStep("lab", () =>
        runLab(experimentRowId, undefined, orgPath)
      );
      if (!lab) return abort();

      const compose = await execStep("compose", () =>
        runArchitectCompose(experimentRowId, orgPath)
      );
      if (!compose) return abort();

      const ff1 = await execStep("ff_started", () =>
        runFastForward(experimentSlug, orgPath)
      );
      if (!ff1) return abort();

      const witness = await execStep("witness", () =>
        runWitness(experimentSlug, orgPath)
      );
      if (!witness) return abort();

      const director = await execStep("director", () =>
        runDirector(experimentSlug, orgPath)
      );
      if (!director) return abort();

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
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
        {/* Title block — premium top section. */}
        <div className="space-y-4 border-b border-border px-6 pb-5 pt-6">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              </span>
              <DialogTitle>Helix is running the full loop</DialogTitle>
            </div>
            <DialogDescription>
              Brief → Lab → Architect → Witness → Director → Consolidate.
              Tarda ~30s con datos cacheados.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
              {(elapsedMs / 1000).toFixed(1)}s elapsed
            </span>
            <span className="h-3 w-px bg-border" />
            {done ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-success/15 bg-success-soft px-1.5 py-0.5 text-[11px] font-medium text-success">
                <Check className="h-3 w-3" strokeWidth={2.5} />
                Loop completed
              </span>
            ) : aborted ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-danger/15 bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger">
                <X className="h-3 w-3" strokeWidth={2.5} />
                Loop aborted
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/20 bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">
                <span className="relative h-1.5 w-1.5">
                  <span className="absolute inset-0 rounded-full bg-current pulse-dot" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-current" />
                </span>
                running
              </span>
            )}
          </div>
        </div>

        {/* Tool-execution timeline. */}
        <ol className="divide-y divide-border">
          {STEPS.map((step) => {
            const r = results[step.key];
            const isCurrent = currentStep === step.key;
            return (
              <li
                key={step.key}
                className={cn(
                  "px-6 py-4 transition-colors",
                  isCurrent && "bg-accent-soft/30",
                  r.status === "done" && "bg-surface-2/30",
                  r.status === "error" && "bg-danger-soft/20"
                )}
              >
                <div className="flex items-start gap-3">
                  <StatusIcon status={r.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground-strong">
                        <span className="h-1 w-1 rounded-full bg-accent" />
                        {step.agentLabel}
                      </span>
                      <span
                        className={cn(
                          "text-[13px] font-medium",
                          isCurrent && "caret-blink",
                          r.status === "done" && "text-foreground/90",
                          r.status === "idle" && "text-muted-foreground/80",
                          r.status === "error" && "text-danger"
                        )}
                      >
                        {step.title}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                    {r.prUrl && (
                      <a
                        href={r.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
                      >
                        Open PR
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {r.error && (
                      <p className="mt-2 text-[12px] text-danger">{r.error}</p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {done && (
            <li className="bg-accent-soft/20 px-6 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Github className="h-3 w-3" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground-strong">
                      <span className="h-1 w-1 rounded-full bg-accent" />
                      Helix
                    </span>
                    <span className="text-[13px] font-medium text-foreground">
                      Esperando resultados
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                    Las feature flags están en producción. Witness analizará los
                    resultados con Bayesian posteriors en los próximos 7 días.
                  </p>
                  {results.compose.prUrl && (
                    <a
                      href={results.compose.prUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:underline"
                    >
                      <Github className="h-3 w-3" />
                      Ver PR de feature flags
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </li>
          )}
        </ol>

        {/* Footer. */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
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
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" strokeWidth={2} />
      </span>
    );
  if (status === "done")
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  if (status === "error")
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
        <X className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  return (
    <Circle
      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40"
      strokeWidth={1.5}
    />
  );
}
