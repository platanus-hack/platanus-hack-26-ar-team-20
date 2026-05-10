import { Bot } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Agent = {
  name: string;
  role: string;
  video: string;
  description: string;
};

// Order mirrors the experiment loop: who reads the world (Indexer/Pulse) →
// who frames the bet (Briefer/Lab) → who builds + ships (Architect) →
// who measures + decides (Witness/Director).
const AGENTS: Agent[] = [
  {
    name: "Indexer",
    role: "Reader",
    video: "/videos/Indexer.mp4",
    description:
      "Lee tu repo y construye un índice semántico de features, flags y endpoints — la fuente de verdad sobre qué superficies existen.",
  },
  {
    name: "Pulse",
    role: "Watcher",
    video: "/videos/Pulse.mp4",
    description:
      "Monitorea KPIs en producción y propone experimentos cuando detecta caídas o oportunidades de mejora.",
  },
  {
    name: "Briefer",
    role: "Interpreter",
    video: "/videos/Briefer.mp4",
    description:
      "Traduce briefs vagos en lenguaje natural a problemas estructurados: KPI primario, surface area, target lift y guardrails.",
  },
  {
    name: "Lab",
    role: "Designer",
    video: "/videos/Lab.mp4",
    description:
      "Diseña experimentos pre-registrados — control + 1–4 variantes con tráfico, n mínimo y decision rule bayesiano frozen.",
  },
  {
    name: "Architect",
    role: "Implementer",
    video: "/videos/Architect.mp4",
    description:
      "Compone PRs multivariantes detrás de un feature flag y al cerrar el loop consolida el winner en el codebase.",
  },
  {
    name: "Witness",
    role: "Analyst",
    video: "/videos/Witness.mp4",
    description:
      "Computa posteriors bayesianos por arm + checks de guardrails y emite un veredicto por variante con su rationale.",
  },
  {
    name: "Director",
    role: "Decider",
    video: "/videos/Director.mp4",
    description:
      "Aplica la policy de la org sobre el verdicto de Witness — rampea winners, mata losers o extiende observación.",
  },
];

export default function AgentsPage() {
  return (
    <div className="space-y-10">
      {/* Page header — Linear-quality. Mirrors the Overview page. */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground/70">
            Workspace agents
          </p>
          <h1 className="flex items-center gap-2.5 text-3xl font-semibold tracking-tight text-foreground">
            <span>Agents</span>
            <span aria-hidden role="img" className="text-[26px] leading-none">
              🤖
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-2/40 px-2.5">
            <Bot className="h-3 w-3 text-accent" strokeWidth={2} />
            <span className="font-mono tabular-nums">{AGENTS.length}</span>
            <span className="text-muted-foreground/70">agents</span>
          </span>
        </div>
      </header>

      {/* Agents table — premium, hairline-bordered, mirrors the
          dashboard's experiments table. Video sits in the first column at
          a comfortable 16:9 size; the rest of the row is name + role +
          description. All 7 agents fit without horizontal scroll. */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface-2/40">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[260px]">Demo</TableHead>
              <TableHead className="w-[160px]">Agent</TableHead>
              <TableHead className="w-[120px]">Role</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {AGENTS.map((agent) => (
              <TableRow key={agent.name} className="align-top">
                <TableCell className="py-3">
                  <div className="aspect-video w-[228px] overflow-hidden rounded-lg border border-border bg-surface-3">
                    <video
                      src={agent.video}
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                      aria-label={`${agent.name} agent demo`}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-[13.5px] font-medium tracking-tight text-foreground">
                    {agent.name}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-md border border-border bg-surface-3/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground-strong">
                    {agent.role}
                  </span>
                </TableCell>
                <TableCell>
                  <p className="max-w-[58ch] text-[12.5px] leading-relaxed text-muted-foreground">
                    {agent.description}
                  </p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
