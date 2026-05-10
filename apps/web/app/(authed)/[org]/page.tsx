import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FlaskConical,
  GitPullRequestArrow,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ExperimentRow,
  type ExperimentRowData,
} from "@/components/dashboard/ExperimentRow";
import { WelcomeModal } from "@/components/dashboard/WelcomeModal";
import { createServerClient } from "@/lib/supabase/server";

const DEMO_LANDING_EXPERIMENT_SLUG = "exp_cart_conv_2026";

const ACTIVE_STATUSES = ["running", "analyzing", "consolidating"] as const;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

type ExperimentRow_DB = {
  id: string;
  experiment_id: string;
  status: string;
  started_at: string | null;
  variants: unknown;
  results: unknown;
  consolidated_at: string | null;
  repo_id: string;
  repos: { github_repo_full_name: string } | null;
};

type RepoRow = {
  id: string;
  flag_provider: string;
  analytics_provider: string;
};

type DecisionRow = {
  id: string;
  action: string;
  rationale: string | null;
  created_at: string;
  experiment_id: string | null;
  experiments: { experiment_id: string } | null;
};

type AgentRunRow = {
  output: unknown;
};

type WitnessVariantVerdict = {
  variant_key: string;
  is_control?: boolean;
  rate?: number;
};

type WitnessLikeResults = {
  winning_variant?: string;
  variant_verdicts?: WitnessVariantVerdict[];
};

function variantsCount(variants: unknown): number {
  return Array.isArray(variants) ? variants.length : 0;
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / MS_PER_DAY));
}

function liftPpFromResults(results: unknown): number {
  if (!results || typeof results !== "object") return 0;
  const r = results as WitnessLikeResults;
  if (!r.winning_variant || !Array.isArray(r.variant_verdicts)) return 0;
  const winner = r.variant_verdicts.find(
    (v) => v.variant_key === r.winning_variant
  );
  const control = r.variant_verdicts.find((v) => v.is_control);
  if (!winner || !control) return 0;
  const w = typeof winner.rate === "number" ? winner.rate : 0;
  const c = typeof control.rate === "number" ? control.rate : 0;
  return (w - c) * 100;
}

function locDeltaFromConsolidate(output: unknown): number {
  if (!output || typeof output !== "object") return 0;
  const o = output as { files_deleted?: unknown; files_moved?: unknown };
  const deleted = Array.isArray(o.files_deleted) ? o.files_deleted.length : 0;
  const kept = Array.isArray(o.files_moved) ? o.files_moved.length : 0;
  return Math.max(0, deleted - kept);
}

function decisionMeta(action: string): {
  icon: typeof GitPullRequestArrow;
  title: string;
} {
  switch (action) {
    case "ship_winner":
      return { icon: GitPullRequestArrow, title: "Ship winner" };
    case "kill_variant":
      return { icon: TriangleAlert, title: "Kill variant" };
    case "kill_all":
      return { icon: TriangleAlert, title: "Kill all variants" };
    case "extend_top_two":
      return { icon: FlaskConical, title: "Extend top two" };
    case "schedule_consolidate":
      return { icon: ShieldCheck, title: "Consolidate winner" };
    default:
      return { icon: ShieldCheck, title: action };
  }
}

export default async function OrgOverviewPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: orgSlug } = await params;
  const supabase = await createServerClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (!org) notFound();

  const since30d = new Date(Date.now() - 30 * MS_PER_DAY).toISOString();

  const [
    activeExpsRes,
    activeCountRes,
    consolidatedRes,
    pendingCountRes,
    pendingListRes,
    reposRes,
    consolidateRunsRes,
  ] = await Promise.all([
    supabase
      .from("experiments")
      .select(
        "id, experiment_id, status, started_at, variants, results, consolidated_at, repo_id, repos(github_repo_full_name)"
      )
      .in("status", ACTIVE_STATUSES as unknown as string[])
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(10),
    supabase
      .from("experiments")
      .select("id", { count: "exact", head: true })
      .in("status", ACTIVE_STATUSES as unknown as string[]),
    supabase
      .from("experiments")
      .select("results, consolidated_at")
      .eq("status", "consolidated")
      .gte("consolidated_at", since30d),
    supabase
      .from("decisions")
      .select("id", { count: "exact", head: true })
      .eq("human_required", true)
      .is("human_approved_at", null),
    supabase
      .from("decisions")
      .select(
        "id, action, rationale, created_at, experiment_id, experiments(experiment_id)"
      )
      .eq("human_required", true)
      .is("human_approved_at", null)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase.from("repos").select("id, flag_provider, analytics_provider"),
    supabase
      .from("agent_runs")
      .select("output")
      .eq("agent", "architect")
      .eq("status", "success")
      .gte("created_at", since30d),
  ]);

  const activeExps = (activeExpsRes.data ?? []) as unknown as ExperimentRow_DB[];
  const consolidated = (consolidatedRes.data ?? []) as Array<{
    results: unknown;
  }>;
  const pendingDecisions = (pendingListRes.data ?? []) as unknown as DecisionRow[];
  const repos = (reposRes.data ?? []) as RepoRow[];
  const consolidateRuns = (consolidateRunsRes.data ?? []) as AgentRunRow[];

  const activeCount = activeCountRes.count ?? activeExps.length;
  const pendingCount = pendingCountRes.count ?? pendingDecisions.length;

  const aggLiftPp = consolidated.reduce(
    (sum, row) => sum + liftPpFromResults(row.results),
    0
  );

  const techDebtRemoved = consolidateRuns.reduce(
    (sum, run) => sum + locDeltaFromConsolidate(run.output),
    0
  );

  const repoCount = repos.length;
  const providerCount = new Set(
    repos.flatMap((r) => [r.flag_provider, r.analytics_provider])
  ).size;

  const tableRows: ExperimentRowData[] = activeExps.map((e) => ({
    experimentId: e.experiment_id,
    repoFullName: e.repos?.github_repo_full_name ?? "—",
    variantsCount: variantsCount(e.variants),
    daysLive: daysSince(e.started_at),
    status: e.status,
  }));

  // Land the user on the demo experiment after a 5s "reading the repo"
  // intro modal. The modal gates itself with sessionStorage so it only
  // shows once per browser session.
  const landingExperimentSlug =
    activeExps.find((e) => e.experiment_id === DEMO_LANDING_EXPERIMENT_SLUG)
      ?.experiment_id ??
    activeExps[0]?.experiment_id ??
    DEMO_LANDING_EXPERIMENT_SLUG;

  return (
    <div className="space-y-6">
      <WelcomeModal
        experimentSlug={landingExperimentSlug}
        orgSlug={orgSlug}
      />
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {org.name}
          </h1>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">overview</span>
        </div>
        <Badge variant="outline" className="font-normal">
          {repoCount} {repoCount === 1 ? "repo" : "repos"} · {providerCount}{" "}
          {providerCount === 1 ? "provider" : "providers"}
        </Badge>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Experimentos activos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">
              {activeCount}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              running · analyzing · consolidating
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Lift agregado 30d</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">
              {aggLiftPp >= 0 ? "+" : ""}
              {aggLiftPp.toFixed(1)}
              <span className="text-base font-medium text-muted-foreground">
                {" "}
                pp
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              suma de winners consolidados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending decisions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">
              {pendingCount}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              esperan aprobación humana
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Deuda técnica</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">
              −{techDebtRemoved}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              archivos eliminados por Architect (30d)
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Experimentos activos</CardTitle>
          <CardDescription>
            Últimos 10 experimentos en running, analyzing o consolidating.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tableRows.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No hay experimentos activos.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Experiment</TableHead>
                  <TableHead>Repo</TableHead>
                  <TableHead>Variants</TableHead>
                  <TableHead>Días live</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.map((row) => (
                  <ExperimentRow
                    key={row.experimentId}
                    experiment={row}
                    orgSlug={orgSlug}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decisiones esperando tu OK</CardTitle>
          <CardDescription>
            Acciones que el Director propuso pero requieren aprobación humana.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingDecisions.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nada pendiente. Helix está corriendo en autopilot.
            </div>
          ) : (
            <ul className="divide-y">
              {pendingDecisions.map((d) => {
                const meta = decisionMeta(d.action);
                const Icon = meta.icon;
                const expSlug = d.experiments?.experiment_id;
                const reviewHref = expSlug
                  ? `/${orgSlug}/experiments/${expSlug}#decisions`
                  : `/${orgSlug}/audit`;

                return (
                  <li
                    key={d.id}
                    className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{meta.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {d.rationale ??
                          (expSlug
                            ? `Experimento ${expSlug}`
                            : "Pending decision")}
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={reviewHref}>Review</Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
