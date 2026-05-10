"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  ExternalLink,
  GitPullRequest,
  Loader2,
} from "lucide-react";
import { ExperimentCard } from "@/components/experiment/ExperimentCard";
import { AgentRunIndicator } from "@/components/experiment/AgentRunIndicator";
import {
  RunNextAgentPanel,
  type RunNextAgentPanelProps,
} from "@/components/experiment/RunNextAgentPanel";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import {
  VariantTable,
  type VariantVerdict,
} from "@/components/experiment/VariantTable";
import { createBrowserClient } from "@/lib/supabase/client";
import type { AgentName } from "@/lib/agent-actions";
import { cn } from "@/lib/utils";

type Variant = {
  variant_key: string;
  is_control?: boolean;
  axis?: string | null;
  hypothesis?: string;
  implementation_brief?: string;
  expected_lift_pp?: number | null;
};

type Problem = {
  type?: string;
  surface_area?: string;
  description?: string;
  primary_kpi?: string;
  current_value?: number | null;
  target_lift_pp?: number;
  guardrail_kpis?: string[];
};

type Design = {
  primary_kpi?: string;
  guardrail_kpis?: string[];
  traffic_split?: number[];
  min_n_per_arm?: number;
  min_observation_days?: number;
  max_observation_days?: number;
  decision_rule?: string;
};

type Results = {
  primary_kpi?: string;
  winning_variant?: string | null;
  experiment_verdict?: string;
  variant_verdicts?: VariantVerdict[];
  narrative?: string;
  n_total?: number;
};

type DecisionRow = {
  id: string;
  action: string;
  rationale: string | null;
  executed: boolean;
  human_required: boolean;
  human_approved_at: string | null;
  created_at: string;
};

type ConsolidateRun = {
  id: string;
  created_at: string;
  status: string;
  output: {
    pr_url?: string;
    branch?: string;
    files_deleted?: string[];
    files_moved?: { from: string; to: string }[];
    flag_deleted?: boolean;
    winning_variant?: string;
  } | null;
};

export type ExperimentClientProps = {
  experimentRowId: string;
  experimentSlug: string;
  orgSlug: string;
  status: string;
  problem: Problem | null;
  variants: Variant[];
  design: Design | null;
  results: Results | null;
  prUrl: string | null;
  flagKey: string | null;
  startedAt: string | null;
  initialDecisions: DecisionRow[];
  initialConsolidateRuns: ConsolidateRun[];
  fastForwardEnabled: boolean;
};

export function ExperimentClient(props: ExperimentClientProps) {
  const {
    experimentRowId,
    experimentSlug,
    orgSlug,
    status,
    problem,
    variants,
    design,
    results,
    prUrl,
    flagKey,
    startedAt,
    fastForwardEnabled,
  } = props;

  const router = useRouter();
  const [pendingAgent, setPendingAgent] = useState<AgentName | null>(null);
  const orgPath = `/${orgSlug}/experiments/${experimentSlug}`;

  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`exp-${experimentRowId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_runs",
          filter: `experiment_id=eq.${experimentRowId}`,
        },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "decisions",
          filter: `experiment_id=eq.${experimentRowId}`,
        },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "experiments",
          filter: `id=eq.${experimentRowId}`,
        },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [experimentRowId, router]);

  const hasProblem =
    !!problem &&
    Object.values(problem).some((v) => v !== null && v !== undefined);
  const hasDesign = !!design && Array.isArray(design.traffic_split);
  const hasResults =
    !!results &&
    Array.isArray(results.variant_verdicts) &&
    results.variant_verdicts.length > 0;
  const hasVariants = variants.length > 0;
  const hasPrUrl = !!prUrl;

  // The experiment is "fast-forwarded" if started_at is at least min_obs days ago.
  const minObs = design?.min_observation_days ?? 7;
  let fastForwarded = false;
  if (startedAt) {
    const ms = Date.now() - new Date(startedAt).getTime();
    const days = ms / (1000 * 60 * 60 * 24);
    fastForwarded = days >= minObs;
  }

  const panelProps: RunNextAgentPanelProps = {
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
    onAgentChange: setPendingAgent,
  };

  return (
    <div className="w-full min-w-0 space-y-8">
      {/* Header — experiment slug + meta. Clean, breathable. */}
      <header className="space-y-4">
        <div className="space-y-2">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground/70">
            Experiment
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-medium tracking-tight text-foreground">
              {experimentSlug}
            </h1>
            <StatusBadge status={status} />
          </div>
          {problem?.description && (
            <p className="max-w-3xl text-[13.5px] leading-relaxed text-muted-foreground">
              {problem.description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {problem?.primary_kpi && (
            <Tag>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                kpi
              </span>
              <span className="font-mono">{problem.primary_kpi}</span>
            </Tag>
          )}
          {flagKey && (
            <Tag>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                flag
              </span>
              <span className="font-mono">{flagKey}</span>
            </Tag>
          )}
          {prUrl && (
            <a
              href={prUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border bg-surface-2/40 px-2 text-[11.5px] text-foreground transition-colors hover:border-border-strong hover:bg-surface-3/60"
            >
              <GitPullRequest className="h-3 w-3" strokeWidth={2} />
              <span>PR</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground/60" />
            </a>
          )}
          <div className="ml-auto">
            <RunNextAgentPanel {...panelProps} />
          </div>
        </div>
      </header>

      {/* Live agent indicator slot. */}
      <AgentRunIndicator agent={pendingAgent} />

      {/* Agent timeline — connected steps. */}
      <div className="space-y-4">
        <ExperimentCard
          step={1}
          agent="brief"
          title="¿En qué trabajamos?"
          description="Problema y KPI primario."
          empty={!hasProblem}
          emptyHint="Brief no corrió. Carga un problema vía /experiments/new."
        >
          {problem && <ProblemView problem={problem} />}
        </ExperimentCard>

        <ExperimentCard
          step={2}
          agent="lab"
          title="¿Qué probamos?"
          description="Variantes que el Lab diseñó."
          empty={!hasVariants}
          emptyHint="Lab todavía no diseñó variantes."
        >
          {hasVariants && <VariantsGrid variants={variants} />}
        </ExperimentCard>

        <ExperimentCard
          step={3}
          agent="lab"
          title="¿Cómo lo probamos?"
          description="Diseño pre-registrado, frozen."
          empty={!hasDesign}
          emptyHint="Sin diseño aún."
        >
          {design && <DesignGrid design={design} variantCount={variants.length} />}
        </ExperimentCard>

        <ExperimentCard
          step={4}
          agent="witness"
          title="¿Qué funcionó?"
          description="Multi-arm Bayesian results."
          empty={status !== "shipped" && !hasResults}
          emptyHint="Witness aún no corrió. Hacé Fast-forward + Run Witness."
        >
          {status === "shipped" ? (
            <WaitingForResults
              startedAt={startedAt}
              minObservationDays={design?.min_observation_days ?? 7}
            />
          ) : (
            hasResults &&
            results && (
              <div className="space-y-4">
                <VariantTable
                  variants={results.variant_verdicts ?? []}
                  winningVariant={results.winning_variant ?? null}
                  primaryKpi={
                    results.primary_kpi ?? design?.primary_kpi ?? null
                  }
                />
                {results.narrative && (
                  <p className="rounded-lg border border-border bg-surface-2/40 p-3.5 text-[13px] leading-relaxed text-muted-foreground">
                    {results.narrative}
                  </p>
                )}
              </div>
            )
          )}
        </ExperimentCard>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border bg-surface-2/40 px-2 text-[11.5px] text-foreground/90">
      {children}
    </span>
  );
}

function ProblemView({ problem }: { problem: Problem }) {
  const cells: { label: string; values: string[] }[] = [
    { label: "Tipo", values: [problem.type ?? "—"] },
    { label: "Superficie", values: [problem.surface_area ?? "—"] },
    { label: "KPI primario", values: [problem.primary_kpi ?? "—"] },
    {
      label: "Valor actual",
      values: [
        problem.current_value !== null && problem.current_value !== undefined
          ? `${(problem.current_value * 100).toFixed(1)}%`
          : "—",
      ],
    },
    {
      label: "Target lift",
      values: [
        problem.target_lift_pp !== undefined
          ? `+${problem.target_lift_pp}pp`
          : "—",
      ],
    },
  ];

  const guardrails =
    problem.guardrail_kpis && problem.guardrail_kpis.length > 0
      ? problem.guardrail_kpis
      : null;

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm md:grid-cols-3">
      {cells.map((row) => (
        <Cell key={row.label} label={row.label} values={row.values} />
      ))}
      <div className="space-y-1.5">
        <dt className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Guardrails
        </dt>
        <dd>
          {guardrails ? (
            <CollapsibleChipRow items={guardrails} />
          ) : (
            <span className="inline-flex items-center rounded-md border border-border bg-surface-2/60 px-1.5 py-0.5 font-mono text-[11.5px] text-muted-foreground/80">
              —
            </span>
          )}
        </dd>
      </div>
    </dl>
  );
}

function Cell({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="space-y-1.5">
      <dt className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </dt>
      <dd className="flex flex-wrap gap-1">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center rounded-md border border-border bg-surface-2/60 px-1.5 py-0.5 font-mono text-[11.5px] text-foreground/90"
          >
            {v}
          </span>
        ))}
      </dd>
    </div>
  );
}

/*
  One-line chip row that collapses overflow into a "+N más" actionable.
  Designed to keep the Guardrails block visually quiet — most experiments
  have 2–4 guardrails and only the first is shown until expanded.
*/
function CollapsibleChipRow({ items }: { items: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, 1);
  const remaining = items.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((v) => (
        <span
          key={v}
          className="inline-flex items-center rounded-md border border-border bg-surface-2/60 px-1.5 py-0.5 font-mono text-[11.5px] text-foreground/90"
        >
          {v}
        </span>
      ))}
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="press-feedback inline-flex items-center rounded-md border border-dashed border-border-strong bg-transparent px-1.5 py-0.5 font-mono text-[11.5px] text-muted-foreground-strong transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
          aria-label={`Mostrar ${remaining} guardrails más`}
        >
          +{remaining} más
        </button>
      )}
      {expanded && items.length > 1 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="press-feedback inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
          aria-label="Colapsar"
        >
          Colapsar
        </button>
      )}
    </div>
  );
}

function WaitingForResults({
  startedAt,
  minObservationDays,
}: {
  startedAt: string | null;
  minObservationDays: number;
}) {
  const days = startedAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(startedAt).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0;
  const remaining = Math.max(0, minObservationDays - days);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-2/40">
      <div className="flex items-start gap-3 px-4 py-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Clock className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[13.5px] font-medium text-foreground caret-blink">
            Esperando resultados reales
          </p>
          <p className="max-w-[58ch] text-[12.5px] leading-relaxed text-muted-foreground">
            El experimento está corriendo en producción. Witness sigue
            recolectando señal real durante la ventana de observación; el
            verdicto final se confirma cuando termine.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-1/40 px-4 py-2.5">
        <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <Loader2
            className="h-3 w-3 animate-spin text-accent"
            strokeWidth={2}
          />
          <span>
            {remaining > 0
              ? `Próximo recompute de Witness en ~${remaining} ${remaining === 1 ? "día" : "días"}`
              : "Listo para recomputar — esperando trigger"}
          </span>
        </div>
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground/70">
          observation window
        </span>
      </div>
    </div>
  );
}

// Tailwind v4 needs class literals to be statically discoverable, so we
// enumerate every possible xl grid-cols class instead of building it
// dynamically. Cards always fill the row width regardless of count.
const XL_COLS: Record<number, string> = {
  1: "xl:grid-cols-1",
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
};

function VariantsGrid({ variants }: { variants: Variant[] }) {
  const xlCols = XL_COLS[Math.min(variants.length, 4)] ?? "xl:grid-cols-4";
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-2.5 sm:grid-cols-2",
        xlCols
      )}
    >
      {variants.map((v, idx) => (
        <div
          key={v.variant_key}
          className={cn(
            "group relative flex flex-col gap-2 rounded-lg border border-border bg-surface-2/40 p-3.5 transition-colors",
            "hover:border-border-strong hover:bg-surface-3/40"
          )}
          style={{ ["--stagger-index" as string]: idx }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11.5px] text-foreground">
              {v.variant_key}
            </span>
            {v.is_control ? (
              <span className="rounded-md border border-info/20 bg-info-soft px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-info">
                control
              </span>
            ) : v.expected_lift_pp != null ? (
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                +{v.expected_lift_pp}pp
              </span>
            ) : null}
          </div>
          {v.axis && (
            <div className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground/70">
              eje · {v.axis}
            </div>
          )}
          {v.hypothesis && (
            <p className="text-[13px] leading-snug text-foreground/90">
              {v.hypothesis}
            </p>
          )}
          {v.implementation_brief && (
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              {v.implementation_brief}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function DesignGrid({
  design,
  variantCount,
}: {
  design: Design;
  variantCount: number;
}) {
  const totalN =
    design.min_n_per_arm && variantCount
      ? design.min_n_per_arm * variantCount
      : null;
  const cells: {
    label: string;
    value: React.ReactNode;
    hint?: string;
  }[] = [
    {
      label: "Población",
      value: totalN
        ? `${totalN.toLocaleString()} sesiones`
        : design.min_n_per_arm
          ? `${design.min_n_per_arm.toLocaleString()} / arm`
          : "—",
      hint:
        design.traffic_split && design.traffic_split.length
          ? `Traffic split: ${design.traffic_split
              .map((t) => `${(t * 100).toFixed(0)}%`)
              .join(" / ")}`
          : undefined,
    },
    {
      label: "Decision rule",
      value: humanizeDecisionRule(design.decision_rule),
    },
    {
      label: "Observation window",
      value:
        design.min_observation_days && design.max_observation_days
          ? `${design.min_observation_days}–${design.max_observation_days} días`
          : "—",
    },
    {
      label: "Trade-offs",
      value:
        design.guardrail_kpis && design.guardrail_kpis.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground/80">Guardrails:</span>
            {design.guardrail_kpis.map((g) => (
              <code
                key={g}
                className="inline-flex items-center rounded-md border border-border bg-surface-3/50 px-1.5 py-0.5 font-mono text-[11.5px] text-foreground/90"
              >
                {g}
              </code>
            ))}
          </div>
        ) : (
          "Sin guardrails declarados"
        ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-2/40 p-3.5"
        >
          <div className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground/70">
            {cell.label}
          </div>
          <div className="text-[13px] leading-relaxed text-foreground/90">
            {cell.value}
          </div>
          {cell.hint && (
            <div className="text-[11.5px] text-muted-foreground">
              {cell.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/*
  Translates the canonical "Bayesian Thompson sampling. Winner declared when
  p(best > control) > 0.95 AND no guardrail breach." decision rule (the only
  one Lab currently emits) into plain Spanish. Falls back to the raw string
  for any rule we don't recognise yet.
*/
function humanizeDecisionRule(rule: string | undefined): React.ReactNode {
  if (!rule) return "—";
  const isCanonical =
    /thompson sampling/i.test(rule) &&
    /p\(best/i.test(rule) &&
    /0\.95/i.test(rule);
  if (isCanonical) {
    return (
      <>
        Declaramos al winner cuando supera al control con al menos{" "}
        <span className="font-medium text-foreground">95% de probabilidad</span>{" "}
        bayesiana y ningún guardrail está en breach.
      </>
    );
  }
  return rule;
}
