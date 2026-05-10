"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
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

// All internal step keys, including silent demo plumbing (reset / ff_started)
// that runs without its own panel. The user only sees the four agent panels.
type StepKey =
  | "reset"
  | "lab"
  | "compose"
  | "ff_started"
  | "witness"
  | "director";

type VisibleStepKey = "lab" | "compose" | "witness" | "director";

type StepStatus = "idle" | "running" | "done" | "error";

type VisibleStepConfig = {
  key: VisibleStepKey;
  agentLabel: string;
  video: string;
  title: string;
  description: string;
};

const VISIBLE_STEPS: VisibleStepConfig[] = [
  {
    key: "lab",
    agentLabel: "Lab",
    video: "/videos/Lab.mp4",
    title: "Lab está diseñando las variantes",
    description:
      "Genera 4 variantes (recall · cross_sell · urgency) + control con tráfico 25/25/25/25 y un decision rule bayesiano frozen.",
  },
  {
    key: "compose",
    agentLabel: "Architect",
    video: "/videos/Architect.mp4",
    title: "Architect está componiendo el PR",
    description:
      "Abre el PR en JoaquinGiorgis/helix-demo-saas con las 4 variantes detrás de un solo feature flag multivariante en PostHog.",
  },
  {
    key: "witness",
    agentLabel: "Witness",
    video: "/videos/Witness.mp4",
    title: "Witness está computando posteriors",
    description:
      "Bayesian Thompson sampling sobre cada arm + check de guardrails (refund, support, AOV) para emitir un veredicto por variante.",
  },
  {
    key: "director",
    agentLabel: "Director",
    video: "/videos/Director.mp4",
    title: "Director está aplicando la policy",
    description:
      "Ejecuta ship_winner contra PostHog: rampea el winner a 100%, las perdedoras a 0% y registra la decisión auditable.",
  },
];

// Silent steps map to the next visible step's "running" panel — so the user
// sees Witness pre-running while ff_started compresses time, etc.
const SILENT_STEP_FORWARDS: Record<"reset" | "ff_started", VisibleStepKey> = {
  reset: "lab",
  ff_started: "witness",
};

type StepResult = { status: StepStatus; prUrl?: string | null; error?: string | null };

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

  const [results, setResults] = useState<Record<VisibleStepKey, StepResult>>(
    () =>
      Object.fromEntries(
        VISIBLE_STEPS.map((s) => [s.key, { status: "idle" } as StepResult])
      ) as Record<VisibleStepKey, StepResult>
  );
  const [currentVisible, setCurrentVisible] = useState<VisibleStepKey>(
    VISIBLE_STEPS[0].key
  );
  const [composePrUrl, setComposePrUrl] = useState<string | null>(null);
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
        VISIBLE_STEPS.map((s) => [s.key, { status: "idle" } as StepResult])
      ) as Record<VisibleStepKey, StepResult>
    );
    setCurrentVisible(VISIBLE_STEPS[0].key);
    setComposePrUrl(null);
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

  const setVisibleResult = (key: VisibleStepKey, patch: Partial<StepResult>) =>
    setResults((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));

  // Run any step (visible or silent). Visible steps surface their state in
  // the UI; silent ones forward to the next visible step's "running" panel
  // so the modal never goes blank between agents.
  const execStep = async (
    key: StepKey,
    runner: () => Promise<AgentActionResult>
  ): Promise<unknown | null> => {
    const target: VisibleStepKey =
      key in SILENT_STEP_FORWARDS
        ? SILENT_STEP_FORWARDS[key as "reset" | "ff_started"]
        : (key as VisibleStepKey);

    setCurrentVisible(target);
    if (!(key in SILENT_STEP_FORWARDS)) {
      setVisibleResult(target, { status: "running", error: null });
    } else {
      // Silent: keep the next visible step in "running" appearance so the
      // agent video is on screen while plumbing finishes.
      setVisibleResult(target, { status: "running", error: null });
    }

    const result = await runner();
    if (!result.ok) {
      // Surface the error on the visible target step.
      setVisibleResult(target, { status: "error", error: result.error });
      return null;
    }

    if (!(key in SILENT_STEP_FORWARDS)) {
      const prUrl = extractPrUrl(result.data);
      setVisibleResult(target, { status: "done", prUrl, error: null });
      if (key === "compose" && prUrl) setComposePrUrl(prUrl);
    }
    return result.data;
  };

  const runFlow = async () => {
    try {
      // Silent: reset → folds into Lab's running panel.
      if (!(await execStep("reset", () => runDemoReset(orgPath)))) return abort();

      if (
        !(await execStep("lab", () =>
          runLab(experimentRowId, undefined, orgPath)
        ))
      )
        return abort();

      if (
        !(await execStep("compose", () =>
          runArchitectCompose(experimentRowId, orgPath)
        ))
      )
        return abort();

      // Silent: ff_started → folds into Witness's running panel.
      if (
        !(await execStep("ff_started", () =>
          runFastForward(experimentSlug, orgPath)
        ))
      )
        return abort();

      if (
        !(await execStep("witness", () =>
          runWitness(experimentSlug, orgPath)
        ))
      )
        return abort();

      if (
        !(await execStep("director", () =>
          runDirector(experimentSlug, orgPath)
        ))
      )
        return abort();

      setDone(true);
      router.refresh();
    } finally {
      if (tickerRef.current) clearInterval(tickerRef.current);
    }
  };

  const abort = () => {
    setAborted(true);
    if (tickerRef.current) clearInterval(tickerRef.current);
  };

  const handleClose = () => {
    onOpenChange(false);
    router.refresh();
  };

  const canClose = done || aborted;
  const currentConfig = VISIBLE_STEPS.find((s) => s.key === currentVisible)!;
  const currentResult = results[currentVisible];
  const currentIndex = VISIBLE_STEPS.findIndex((s) => s.key === currentVisible);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !canClose) return; // disable close while running
        onOpenChange(nextOpen);
        if (!nextOpen) router.refresh();
      }}
    >
      <DialogContent className="max-w-lg gap-0 p-0 [&>button]:hidden overflow-hidden">
        {/* Header — compact, single-line. */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 pb-4 pt-5">
          <DialogHeader className="space-y-1.5 text-left">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft text-accent">
                <Sparkles className="h-3 w-3" strokeWidth={2} />
              </span>
              <DialogTitle className="text-[14px] font-medium tracking-tight">
                Helix está corriendo el loop
              </DialogTitle>
            </div>
            <DialogDescription className="text-[12px] leading-relaxed">
              Lab → Architect → Witness → Director. Tarda ~30s con datos
              cacheados.
            </DialogDescription>
          </DialogHeader>
          {canClose && (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md border border-border bg-surface-3/40 p-1 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Body — agent video + step description, OR final panel. */}
        {done ? (
          <FinalPanel prUrl={composePrUrl} />
        ) : (
          <ActiveStepPanel
            config={currentConfig}
            status={currentResult.status}
            error={currentResult.error ?? null}
          />
        )}

        {/* Footer — progress dots + elapsed time + close. */}
        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-1/40 px-5 py-3">
          <div className="flex items-center gap-2">
            {VISIBLE_STEPS.map((s, idx) => {
              const r = results[s.key];
              const tone =
                done && idx <= currentIndex
                  ? "bg-success"
                  : r.status === "done"
                    ? "bg-success"
                    : r.status === "running"
                      ? "bg-accent pulse-dot"
                      : r.status === "error"
                        ? "bg-danger"
                        : "bg-muted-foreground/30";
              return (
                <span
                  key={s.key}
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone)}
                  title={s.agentLabel}
                />
              );
            })}
            <span className="ml-1 font-mono text-[10.5px] tabular-nums text-muted-foreground/80">
              {done ? "loop completed" : `step ${currentIndex + 1} de ${VISIBLE_STEPS.length}`}
            </span>
          </div>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {(elapsedMs / 1000).toFixed(1)}s
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Active step panel — agent video + label + description. The video swaps
// when currentVisible changes (key prop forces remount so autoplay restarts).
// ---------------------------------------------------------------------------
function ActiveStepPanel({
  config,
  status,
  error,
}: {
  config: VisibleStepConfig;
  status: StepStatus;
  error: string | null;
}) {
  return (
    <div className="space-y-4 px-5 py-5">
      <div className="aspect-video overflow-hidden rounded-lg border border-border bg-surface-3">
        <video
          key={config.video}
          src={config.video}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
          aria-label={`${config.agentLabel} agent demo`}
        />
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <StatusIcon status={status} />
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground-strong">
            <span className="h-1 w-1 rounded-full bg-accent" />
            {config.agentLabel}
          </span>
          <span
            className={cn(
              "text-[13.5px] font-medium tracking-tight",
              status === "running" && "caret-blink text-foreground",
              status === "done" && "text-foreground/90",
              status === "error" && "text-danger",
              status === "idle" && "text-muted-foreground"
            )}
          >
            {config.title}
          </span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          {config.description}
        </p>
        {error && (
          <p className="rounded-md border border-danger/15 bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Final panel — winner ramped, observation window starting.
// ---------------------------------------------------------------------------
function FinalPanel({ prUrl }: { prUrl: string | null }) {
  return (
    <div className="space-y-4 px-5 py-5">
      <div className="flex items-start gap-3 rounded-lg border border-success/20 bg-success-soft/30 px-3.5 py-3">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[13px] font-medium text-foreground">
            Esperando resultados
          </p>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Las feature flags están en producción. Witness analizará los
            resultados con Bayesian posteriors en los próximos 7 días.
          </p>
        </div>
      </div>

      {prUrl && (
        <a
          href={prUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-3/40 px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-3/60"
        >
          <Github className="h-3 w-3" strokeWidth={2} />
          Ver PR de feature flags
          <ExternalLink className="h-3 w-3 text-muted-foreground/70" />
        </a>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === "running")
    return (
      <Loader2
        className="h-3.5 w-3.5 shrink-0 animate-spin text-accent"
        strokeWidth={2}
      />
    );
  if (status === "done")
    return (
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  if (status === "error")
    return (
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
        <X className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  return (
    <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border-strong" />
  );
}
