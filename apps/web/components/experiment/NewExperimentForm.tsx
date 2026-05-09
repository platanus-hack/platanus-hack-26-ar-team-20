"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowRight, Brain, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
    <Card className="mx-auto w-full max-w-[600px]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <CardTitle>¿Qué problema querés que Helix resuelva?</CardTitle>
        </div>
        <CardDescription>
          Describe la oportunidad en lenguaje natural. El Brief Agent va a
          interpretarla, identificar el KPI primario y proponer guardrails.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {phase === "input" && (
          <form
            action={() => submitBrief(trimmed)}
            className="space-y-4"
          >
            <Textarea
              name="brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder={
                "Ej: Mejorar la conversión del carrito · Reducir el churn de usuarios pago en sus primeros 30 días · Subir el AOV en mid-tier"
              }
              className="min-h-[140px] text-base"
              disabled={isPending}
            />
            {briefError && (
              <p className="text-xs text-destructive">{briefError}</p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={!canSubmit}>
                <Brain className="h-4 w-4" />
                Pensar el experimento
              </Button>
            </div>
          </form>
        )}

        {phase === "thinking" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              Helix está leyendo tu producto...
            </div>
            <ul className="space-y-2">
              {LOADING_STEPS.map((step, idx) => {
                const done = idx < completedSteps;
                return (
                  <li
                    key={step}
                    className={cn(
                      "flex items-center gap-2 text-sm transition-colors",
                      done ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    {step}
                  </li>
                );
              })}
            </ul>
          </div>
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
      </CardContent>
    </Card>
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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border bg-background text-[10px] font-semibold">
              1
            </span>
            <span className="text-sm font-semibold">
              ¿En qué trabajamos?
            </span>
          </div>
          <Badge variant="outline" className="font-normal">
            confidence · {(briefResult.confidence * 100).toFixed(0)}%
          </Badge>
        </div>
        <p className="mt-3 text-sm">{p.description}</p>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
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
        <p className="text-xs text-muted-foreground">{briefResult.notes}</p>
      )}

      {briefResult.needs_clarification &&
      briefResult.clarification_options.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            ¿A cuál de estas opciones te referís?
          </p>
          <div className="flex flex-col gap-2">
            {briefResult.clarification_options.map((option) => (
              <Button
                key={option}
                variant="outline"
                size="lg"
                className="h-auto justify-start whitespace-normal py-3 text-left"
                onClick={() => onClarification(option)}
                disabled={isConfirming}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex justify-between">
          <Button variant="ghost" onClick={onReset} disabled={isConfirming}>
            Volver
          </Button>
          <Button onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
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
    <div>
      <dt className="uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
