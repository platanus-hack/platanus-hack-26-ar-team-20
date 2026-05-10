"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  GitPullRequest,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
    initialDecisions,
    initialConsolidateRuns,
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
    !!problem && Object.values(problem).some((v) => v !== null && v !== undefined);
  const hasDesign = !!design && Array.isArray(design.traffic_split);
  const hasResults =
    !!results && Array.isArray(results.variant_verdicts) && results.variant_verdicts.length > 0;
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
    <div className="w-full min-w-0 space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {experimentSlug}
          </h1>
          <StatusBadge status={status} />
        </div>
        {problem?.description && (
          <p className="max-w-3xl text-sm text-muted-foreground">
            {problem.description}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
          {problem?.primary_kpi && (
            <Badge variant="outline" className="font-normal">
              KPI · {problem.primary_kpi}
            </Badge>
          )}
          {flagKey && (
            <Badge variant="outline" className="font-mono font-normal">
              flag · {flagKey}
            </Badge>
          )}
          {prUrl && (
            <a
              href={prUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 font-normal text-foreground hover:bg-accent"
            >
              <GitPullRequest className="h-3 w-3" />
              PR
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </header>

      <div className="space-y-2">
        <RunNextAgentPanel {...panelProps} />
        <AgentRunIndicator agent={pendingAgent} />
      </div>

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
        empty={!hasResults}
        emptyHint="Witness aún no corrió. Hacé Fast-forward + Run Witness."
      >
        {hasResults && results && (
          <div className="space-y-3">
            <VariantTable
              variants={results.variant_verdicts ?? []}
              winningVariant={results.winning_variant ?? null}
              primaryKpi={results.primary_kpi ?? design?.primary_kpi ?? null}
            />
            {results.narrative && (
              <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                {results.narrative}
              </p>
            )}
          </div>
        )}
      </ExperimentCard>

      <ExperimentCard
        step={5}
        agent="director + architect"
        title="Decisión + cleanup"
        description="Acción del Director y PR de consolidate del Architect."
        empty={initialDecisions.length === 0 && initialConsolidateRuns.length === 0}
        emptyHint="Sin decisiones ni cleanup. Run Director cuando haya results."
      >
        <DecisionsAndCleanup
          decisions={initialDecisions}
          consolidateRuns={initialConsolidateRuns}
        />
      </ExperimentCard>
    </div>
  );
}

function ProblemView({ problem }: { problem: Problem }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Tipo", value: problem.type ?? "—" },
    { label: "Superficie", value: problem.surface_area ?? "—" },
    { label: "KPI primario", value: problem.primary_kpi ?? "—" },
    {
      label: "Valor actual",
      value:
        problem.current_value !== null && problem.current_value !== undefined
          ? `${(problem.current_value * 100).toFixed(1)}%`
          : "—",
    },
    {
      label: "Target lift",
      value:
        problem.target_lift_pp !== undefined
          ? `+${problem.target_lift_pp}pp`
          : "—",
    },
    {
      label: "Guardrails",
      value:
        problem.guardrail_kpis && problem.guardrail_kpis.length > 0
          ? problem.guardrail_kpis.join(", ")
          : "—",
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            {row.label}
          </dt>
          <dd className="mt-0.5 font-mono text-sm">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function VariantsGrid({ variants }: { variants: Variant[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {variants.map((v) => (
        <div
          key={v.variant_key}
          className="rounded-lg border bg-muted/30 p-3 text-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs">{v.variant_key}</span>
            {v.is_control ? (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-800">
                control
              </span>
            ) : v.expected_lift_pp != null ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                +{v.expected_lift_pp}pp esperado
              </span>
            ) : null}
          </div>
          {v.axis && (
            <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              eje · {v.axis}
            </div>
          )}
          {v.hypothesis && (
            <p className="mt-2 text-sm leading-snug">{v.hypothesis}</p>
          )}
          {v.implementation_brief && (
            <p className="mt-2 text-xs text-muted-foreground">
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
  const cells: { label: string; value: React.ReactNode; hint?: string }[] = [
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
      value: design.decision_rule ?? "—",
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
        design.guardrail_kpis && design.guardrail_kpis.length > 0
          ? `Guardrails: ${design.guardrail_kpis.join(", ")}`
          : "Sin guardrails declarados",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-lg border bg-muted/30 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {cell.label}
          </div>
          <div className="mt-1 text-sm">{cell.value}</div>
          {cell.hint && (
            <div className="mt-2 text-xs text-muted-foreground">{cell.hint}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function DecisionsAndCleanup({
  decisions,
  consolidateRuns,
}: {
  decisions: DecisionRow[];
  consolidateRuns: ConsolidateRun[];
}) {
  const items: {
    key: string;
    done: boolean;
    title: string;
    subtitle: string;
    icon: typeof CheckCircle2;
  }[] = [];

  for (const d of decisions.slice(0, 5)) {
    const done = d.executed || !!d.human_approved_at;
    items.push({
      key: `dec-${d.id}`,
      done,
      title: d.action,
      subtitle:
        d.rationale ??
        (d.human_required ? "Esperando aprobación humana" : "Director run"),
      icon: done ? CheckCircle2 : Circle,
    });
  }

  for (const run of consolidateRuns.slice(0, 5)) {
    const filesCount = run.output?.files_deleted?.length ?? 0;
    const winner = run.output?.winning_variant;
    items.push({
      key: `cons-${run.id}`,
      done: run.status === "success",
      title: "Architect consolidate",
      subtitle: winner
        ? `Inlined ${winner} · ${filesCount} archivo(s) eliminado(s)`
        : `${filesCount} archivo(s) eliminado(s)`,
      icon: Trash2,
    });
  }

  if (items.length === 0) return null;

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li
            key={item.key}
            className="flex items-start gap-3 rounded-md border bg-muted/30 p-3"
          >
            <Icon
              className={
                item.done
                  ? "mt-0.5 h-4 w-4 text-green-600"
                  : "mt-0.5 h-4 w-4 text-muted-foreground"
              }
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{item.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {item.subtitle}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
