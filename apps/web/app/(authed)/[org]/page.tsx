import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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

// `shipped` counts as active because Director just ramped the winner to
// 100% but the team is still observing the 7-day post-ship window
// ("Esperando resultados" in the StatusBadge).
const ACTIVE_STATUSES = [
  "running",
  "analyzing",
  "consolidating",
  "shipped",
] as const;
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
  pr_url: string | null;
  repos: { github_repo_full_name: string } | null;
};

type RepoRow = {
  id: string;
  flag_provider: string;
  analytics_provider: string;
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
    shippedExpsRes,
    reposRes,
    shippedCountRes,
  ] = await Promise.all([
    supabase
      .from("experiments")
      .select(
        "id, experiment_id, status, started_at, variants, results, consolidated_at, repo_id, pr_url, repos(github_repo_full_name)"
      )
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(10),
    supabase
      .from("experiments")
      .select("id", { count: "exact", head: true })
      .in("status", ACTIVE_STATUSES as unknown as string[]),
    // For "Lift agregado 30d" we count shipped/consolidated experiments.
    supabase
      .from("experiments")
      .select("results, shipped_at")
      .in("status", ["shipped", "consolidated"])
      .gte("shipped_at", since30d),
    supabase.from("repos").select("id, flag_provider, analytics_provider"),
    // "Features shipped (30d)" — count of experiments that are fully
    // consolidated (winner inlined, flag deleted) in the last 30 days.
    supabase
      .from("experiments")
      .select("id", { count: "exact", head: true })
      .eq("status", "consolidated")
      .gte("shipped_at", since30d),
  ]);

  const activeExps = (activeExpsRes.data ?? []) as unknown as ExperimentRow_DB[];
  const shippedExps = (shippedExpsRes.data ?? []) as Array<{
    results: unknown;
  }>;
  const repos = (reposRes.data ?? []) as RepoRow[];

  const activeCount = activeCountRes.count ?? activeExps.length;
  const shippedCount = shippedCountRes.count ?? shippedExps.length;

  const aggLiftPp = shippedExps.reduce(
    (sum, row) => sum + liftPpFromResults(row.results),
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
    prUrl: e.pr_url ?? null,
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Experimentos activos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">
              {activeCount}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              running · analyzing · shipped · consolidating
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
              suma de winners shippeados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Features shipped 30d</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">
              {shippedCount}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              winners en producción últimos 30 días
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Experimentos</CardTitle>
          <CardDescription>
            Últimos 10 experimentos por fecha de inicio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tableRows.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No hay experimentos todavía.
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
                  <TableHead>PR</TableHead>
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

    </div>
  );
}
