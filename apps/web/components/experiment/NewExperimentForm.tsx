"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ArrowRight,
  ArrowUp,
  Brain,
  Check,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import {
  type BriefResponse,
  createExperimentFromBrief,
  runBrief,
} from "@/lib/agent-actions";

const LOADING_STEPS = [
  "Cargando feature_state",
  "Identificando KPIs disponibles",
  "Computando segmento",
];
const STEP_INTERVAL_MS = 1100;

type Phase = "input" | "thinking" | "review";

const PROMPT_SUGGESTIONS = [
  "Mejorar la conversión del carrito",
  "Reducir churn en los primeros 30 días",
  "Subir el AOV en mid-tier",
  "Aumentar el activation rate del nuevo onboarding",
];

export function NewExperimentForm({ orgSlug }: { orgSlug: string }) {
  const [brief, setBrief] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [completedSteps, setCompletedSteps] = useState(0);
  const [briefResult, setBriefResult] = useState<BriefResponse | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isConfirming, startConfirmTransition] = useTransition();

  useEffect(() => {
    if (phase !== "thinking") return;
    setCompletedSteps(0);
    let count = 0;
    const interval = setInterval(() => {
      count += 1;
      setCompletedSteps(Math.min(count, LOADING_STEPS.length));
      if (count >= LOADING_STEPS.length) clearInterval(interval);
    }, STEP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [phase]);

  const trimmed = brief.trim();
  const canSubmit = trimmed.length >= 4 && !isPending && !isConfirming;

  const submitBrief = (humanBrief: string) => {
    setBriefError(null);
    setPhase("thinking");
    startTransition(async () => {
      const result = await runBrief(humanBrief);
      if (result.ok) {
        setBriefResult(result.data);
        setPhase("review");
      } else {
        setBriefError(result.error);
        setPhase("input");
        toast.error(`Brief failed: ${result.error}`);
      }
    });
  };

  const handleClarificationPick = (option: string) => {
    if (!briefResult) return;
    const refined = `${trimmed}\n\nDecidí: ${option}`;
    setBrief(refined);
    setBriefResult(null);
    submitBrief(refined);
  };

  const handleConfirm = () => {
    if (!briefResult) return;
    startConfirmTransition(async () => {
      const result = await createExperimentFromBrief(
        orgSlug,
        briefResult.interpreted_problem
      );
      if (result && !result.ok) {
        toast.error(`Could not create experiment: ${result.error}`);
      }
    });
  };

  const handleReset = () => {
    setBriefResult(null);
    setBriefError(null);
    setCompletedSteps(0);
    setPhase("input");
  };

  return (
    <div className="mx-auto w-full max-w-[720px]">
      {phase === "input" && (
        <InputPhase
          brief={brief}
          setBrief={setBrief}
          briefError={briefError}
          canSubmit={canSubmit}
          onSubmit={() => submitBrief(trimmed)}
        />
      )}

      {phase === "thinking" && (
        <ThinkingPhase completedSteps={completedSteps} />
      )}

      {phase === "review" && briefResult && (
        <ReviewPanel
          briefResult={briefResult}
          onClarification={handleClarificationPick}
          onConfirm={handleConfirm}
          onReset={handleReset}
          isConfirming={isConfirming}
        />
      )}
    </div>
  );
}

function InputPhase({
  brief,
  setBrief,
  briefError,
  canSubmit,
  onSubmit,
}: {
  brief: string;
  setBrief: (v: string) => void;
  briefError: string | null;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <form
      action={onSubmit}
      className="space-y-5"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
          e.preventDefault();
          onSubmit();
        }
      }}
    >
      {/* Chat-style input — large, breathable, AI-native. */}
      <div className="relative rounded-xl border border-border-strong bg-surface-2/60 p-1 shadow-card transition-colors focus-within:border-accent/40">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Sparkles className="h-3 w-3" strokeWidth={2} />
          </span>
          <span className="text-[12.5px] font-medium text-foreground">
            ¿Qué problema querés que Helix resuelva?
          </span>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            brief agent
          </span>
        </div>

        <Textarea
          name="brief"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Ej: Reducir el churn de usuarios pago en sus primeros 30 días — sospecho que la onboarding de pago no comunica bien el valor."
          className="min-h-[160px] resize-none border-0 bg-transparent text-[14px] leading-relaxed shadow-none focus-visible:ring-0"
        />

        <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
            <span>para enviar</span>
          </div>
          <Button
            type="submit"
            size="sm"
            variant="accent"
            disabled={!canSubmit}
          >
            <Brain className="h-3 w-3" strokeWidth={2} />
            Pensar el experimento
            <ArrowUp className="h-3 w-3" strokeWidth={2.5} />
          </Button>
        </div>
      </div>

      {briefError && (
        <p className="rounded-md border border-danger/15 bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {briefError}
        </p>
      )}

      {/* Suggestion chips. */}
      <div className="space-y-2.5">
        <p className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground/70">
          Sugerencias
        </p>
        <div className="flex flex-wrap gap-2">
          {PROMPT_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setBrief(s)}
              className="press-feedback inline-flex h-7 items-center rounded-md border border-border bg-surface-2/40 px-2.5 text-[12px] text-muted-foreground-strong transition-colors hover:border-border-strong hover:bg-surface-3/60 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}

function ThinkingPhase({ completedSteps }: { completedSteps: number }) {
  return (
    <div className="space-y-5 rounded-xl border border-border bg-surface-2/40 p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Sparkles className="h-3 w-3 animate-pulse" strokeWidth={2} />
        </span>
        <span className="text-[14px] font-medium text-foreground caret-blink">
          Helix está leyendo tu producto
        </span>
      </div>
      <ul className="space-y-2">
        {LOADING_STEPS.map((step, idx) => {
          const done = idx < completedSteps;
          const active = idx === completedSteps;
          return (
            <li
              key={step}
              className={cn(
                "flex items-center gap-2.5 text-[13px] transition-colors",
                done && "text-foreground",
                active && "text-foreground",
                !done && !active && "text-muted-foreground/70"
              )}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {done ? (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success-soft text-success">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                ) : active ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin text-accent"
                    strokeWidth={2}
                  />
                ) : (
                  <span className="h-2 w-2 rounded-full border border-border-strong" />
                )}
              </span>
              {step}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReviewPanel({
  briefResult,
  onClarification,
  onConfirm,
  onReset,
  isConfirming,
}: {
  briefResult: BriefResponse;
  onClarification: (option: string) => void;
  onConfirm: () => void;
  onReset: () => void;
  isConfirming: boolean;
}) {
  const p = briefResult.interpreted_problem;
  const confidence = (briefResult.confidence * 100).toFixed(0);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface-2/40 p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface-3/60 font-mono text-[11px] text-muted-foreground-strong">
              1
            </span>
            <div className="space-y-0.5">
              <p className="text-[14px] font-medium tracking-tight text-foreground">
                ¿En qué trabajamos?
              </p>
              <p className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground/70">
                brief agent · interpretation
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/15 bg-accent-soft px-1.5 py-0.5 font-mono text-[10.5px] text-accent">
            <span className="h-1 w-1 rounded-full bg-current" />
            {confidence}% confidence
          </span>
        </div>

        <p className="mt-4 text-[13.5px] leading-relaxed text-foreground/90">
          {p.description}
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 text-xs md:grid-cols-3">
          <Field label="Tipo">{p.type}</Field>
          <Field label="Superficie">{p.surface_area}</Field>
          <Field label="KPI primario">
            <span className="font-mono">{p.primary_kpi}</span>
          </Field>
          <Field label="Valor actual">
            {p.current_value !== null && p.current_value !== undefined
              ? `${(p.current_value * 100).toFixed(1)}%`
              : "—"}
          </Field>
          <Field label="Target lift">
            {p.target_lift_pp !== undefined
              ? `+${p.target_lift_pp}pp`
              : "—"}
          </Field>
          <Field label="Guardrails">
            {p.guardrail_kpis && p.guardrail_kpis.length > 0
              ? p.guardrail_kpis.join(", ")
              : "—"}
          </Field>
        </dl>
      </div>

      {briefResult.notes && (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {briefResult.notes}
        </p>
      )}

      {briefResult.needs_clarification &&
      briefResult.clarification_options.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-foreground">
            ¿A cuál de estas opciones te referís?
          </p>
          <div className="flex flex-col gap-2">
            {briefResult.clarification_options.map((option) => (
              <button
                key={option}
                type="button"
                className="press-feedback group flex items-start gap-3 rounded-lg border border-border bg-surface-2/40 p-3.5 text-left text-[13px] text-foreground transition-colors hover:border-border-strong hover:bg-surface-3/40 disabled:opacity-50"
                onClick={() => onClarification(option)}
                disabled={isConfirming}
              >
                <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-border-strong group-hover:border-accent" />
                <span className="flex-1">{option}</span>
                <ArrowRight
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 -translate-x-1 text-muted-foreground/0 transition-all group-hover:translate-x-0 group-hover:text-foreground"
                  strokeWidth={2}
                />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={onReset} disabled={isConfirming}>
            Volver
          </Button>
          <Button variant="accent" onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            )}
            Continuar a Lab
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </dt>
      <dd className="text-[12.5px] text-foreground/90">{children}</dd>
    </div>
  );
}
