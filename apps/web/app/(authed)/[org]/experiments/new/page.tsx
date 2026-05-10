import { NewExperimentForm } from "@/components/experiment/NewExperimentForm";

export default async function NewExperimentPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground/70">
          Brief agent
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Nuevo experimento
        </h1>
        <p className="max-w-[600px] text-[13.5px] leading-relaxed text-muted-foreground">
          Helix interpreta el brief, propone un KPI primario y guardrails antes
          de pasar al Lab. Escribí en lenguaje natural — el agente refina lo
          que falta.
        </p>
      </header>

      <NewExperimentForm orgSlug={org} />
    </div>
  );
}
