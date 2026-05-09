import { NewExperimentForm } from "@/components/experiment/NewExperimentForm";

export default async function NewExperimentPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Nuevo experimento
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Helix interpreta el brief, propone un KPI primario y guardrails antes
          de pasar al Lab.
        </p>
      </div>

      <NewExperimentForm orgSlug={org} />
    </div>
  );
}
