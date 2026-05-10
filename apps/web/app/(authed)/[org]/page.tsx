import { notFound } from "next/navigation";
import {
  Activity,
  GitBranch,
  GitPullRequest,
  Sparkles,
  TrendingUp,
} from "lucide-react";
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

  // Land the user on the demo experiment after the 5s "reading the repo"
  // intro modal. The modal gates itself with sessionStorage so it only
  // shows once per browser session.
  const landingExperimentSlug =
    activeExps.find((e) => e.experiment_id === DEMO_LANDING_EXPERIMENT_SLUG)
      ?.experiment_id ??
    activeExps[0]?.experiment_id ??
    DEMO_LANDING_EXPERIMENT_SLUG;

  return (
    <div className="space-y-10">
      <WelcomeModal
        experimentSlug={landingExperimentSlug}
        orgSlug={orgSlug}
      />

      {/* Page header — Linear-quality. */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground/70">
            Workspace overview
          </p>
          <h1 className="flex items-center gap-2.5 text-3xl font-semibold tracking-tight text-foreground">
            <span>{org.name}</span>
            <span aria-hidden role="img" className="text-[26px] leading-none">
              🍌
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-2/40 px-2.5">
            <GitBranch className="h-3 w-3" strokeWidth={2} />
            <span className="font-mono tabular-nums">{repoCount}</span>
            <span className="text-muted-foreground/70">
              {repoCount === 1 ? "repo" : "repos"}
            </span>
          </span>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-2/40 px-2.5">
            <Sparkles className="h-3 w-3 text-accent" strokeWidth={2} />
            <span className="font-mono tabular-nums">{providerCount}</span>
            <span className="text-muted-foreground/70">
              {providerCount === 1 ? "provider" : "providers"}
            </span>
          </span>
        </div>
      </header>

      {/* KPI strip — divide-y, no card-spam. Per Taste rule 4. */}
      <section
        aria-label="Key metrics"
        className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3"
      >
        <Metric
          label="Experimentos activos"
          value={activeCount.toString()}
          hint="running · analyzing · shipped · consolidating"
          icon={Activity}
          tone="info"
        />
        <Metric
          label="Lift agregado · 30d"
          value={`${aggLiftPp >= 0 ? "+" : ""}${aggLiftPp.toFixed(1)}`}
          unit="pp"
          hint="suma de winners shippeados"
          icon={TrendingUp}
          tone={aggLiftPp >= 0 ? "success" : "danger"}
        />
        <Metric
          label="Features shipped · 30d"
          value={shippedCount.toString()}
          hint="winners en producción"
          icon={GitPullRequest}
          tone="accent"
        />
      </section>

      {/* Experiments table — premium, hairline-bordered. */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-[15px] font-medium tracking-tight text-foreground">
              Experiments
            </h2>
            <p className="text-[13px] text-muted-foreground">
              Últimos 10 experimentos por fecha de inicio.
            </p>
          </div>
        </div>

        {tableRows.length === 0 ? (
          <EmptyExperiments />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface-2/40">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[25%]">Experiment</TableHead>
                  <TableHead>Repo</TableHead>
                  <TableHead className="w-[80px]">Variants</TableHead>
                  <TableHead className="w-[100px]">Live</TableHead>
                  <TableHead className="w-[180px]">Status</TableHead>
                  <TableHead className="w-[80px]">PR</TableHead>
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
          </div>
        )}
      </section>
    </div>
  );
}

type IconProp = typeof Activity;

function Metric({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  icon: IconProp;
  tone: "success" | "danger" | "info" | "accent";
}) {
  const toneClass =
    tone === "success"
      ? "text-success bg-success-soft"
      : tone === "danger"
        ? "text-danger bg-danger-soft"
        : tone === "accent"
          ? "text-accent bg-accent-soft"
          : "text-info bg-info-soft";

  return (
    <div className="flex flex-col gap-3 bg-background p-6">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-md ${toneClass}`}
        >
          <Icon className="h-3 w-3" strokeWidth={2} />
        </span>
        <span className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[32px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
          {value}
        </span>
        {unit && (
          <span className="text-[14px] font-medium text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function EmptyExperiments() {
  return (
    <div className="dot-bg flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface-2/30 px-6 py-16 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-2 text-accent">
        <Sparkles className="h-4 w-4" strokeWidth={2} />
      </span>
      <p className="text-[13.5px] font-medium text-foreground">
        Sin experimentos todavía
      </p>
      <p className="max-w-[320px] text-[12.5px] text-muted-foreground">
        Lanzá tu primer experimento desde un brief en lenguaje natural —
        Helix interpreta, diseña y ejecuta el loop.
      </p>
    </div>
  );
}
