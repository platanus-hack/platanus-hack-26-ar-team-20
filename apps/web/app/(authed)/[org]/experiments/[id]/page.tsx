import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { ExperimentClient } from "@/components/experiment/ExperimentClient";

type ExperimentRow = {
  id: string;
  experiment_id: string;
  status: string;
  problem: unknown;
  design: unknown;
  variants: unknown;
  results: unknown;
  pr_url: string | null;
  flag_key: string | null;
  started_at: string | null;
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

type AgentRunRow = {
  id: string;
  agent: string;
  status: string;
  created_at: string;
  output: unknown;
  input: unknown;
};

export default async function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org: orgSlug, id: experimentSlug } = await params;
  const supabase = await createServerClient();

  const { data: exp } = await supabase
    .from("experiments")
    .select(
      "id, experiment_id, status, problem, design, variants, results, pr_url, flag_key, started_at"
    )
    .eq("experiment_id", experimentSlug)
    .maybeSingle<ExperimentRow>();

  if (!exp) notFound();

  const [decisionsRes, runsRes] = await Promise.all([
    supabase
      .from("decisions")
      .select(
        "id, action, rationale, executed, human_required, human_approved_at, created_at"
      )
      .eq("experiment_id", exp.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("agent_runs")
      .select("id, agent, status, created_at, output, input")
      .eq("experiment_id", exp.id)
      .eq("agent", "architect")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const decisions = (decisionsRes.data ?? []) as DecisionRow[];
  const allArchitectRuns = (runsRes.data ?? []) as AgentRunRow[];

  const consolidateRuns = allArchitectRuns
    .filter((run) => {
      const input =
        run.input && typeof run.input === "object" ? (run.input as Record<string, unknown>) : null;
      const output =
        run.output && typeof run.output === "object" ? (run.output as Record<string, unknown>) : null;
      // Consolidate runs have winning_variant on the input and files_deleted/files_moved on output.
      return (
        (input && "winning_variant" in input) ||
        (output && ("files_deleted" in output || "files_moved" in output))
      );
    })
    .map((run) => ({
      id: run.id,
      created_at: run.created_at,
      status: run.status,
      output:
        run.output && typeof run.output === "object"
          ? (run.output as {
              pr_url?: string;
              branch?: string;
              files_deleted?: string[];
              files_moved?: { from: string; to: string }[];
              flag_deleted?: boolean;
              winning_variant?: string;
            })
          : null,
    }));

  const fastForwardEnabled = process.env.HELIX_FAST_FORWARD_ENABLED !== "false";

  return (
    <ExperimentClient
      experimentRowId={exp.id}
      experimentSlug={exp.experiment_id}
      orgSlug={orgSlug}
      status={exp.status}
      problem={
        exp.problem && typeof exp.problem === "object"
          ? (exp.problem as Parameters<typeof ExperimentClient>[0]["problem"])
          : null
      }
      design={
        exp.design && typeof exp.design === "object"
          ? (exp.design as Parameters<typeof ExperimentClient>[0]["design"])
          : null
      }
      variants={
        Array.isArray(exp.variants)
          ? (exp.variants as Parameters<typeof ExperimentClient>[0]["variants"])
          : []
      }
      results={
        exp.results && typeof exp.results === "object"
          ? (exp.results as Parameters<typeof ExperimentClient>[0]["results"])
          : null
      }
      prUrl={exp.pr_url}
      flagKey={exp.flag_key}
      startedAt={exp.started_at}
      initialDecisions={decisions}
      initialConsolidateRuns={consolidateRuns}
      fastForwardEnabled={fastForwardEnabled}
    />
  );
}
