import { cn } from "@/lib/utils";

type Props = {
  step: 1 | 2 | 3 | 4 | 5;
  agent: string;
  title: string;
  description?: string;
  empty?: boolean;
  emptyHint?: string;
  children?: React.ReactNode;
};

/*
  Agent step block — looks like a tool execution panel in modern AI UIs.
  Step number is anchored on the left, agent label is a monospace pill
  on the right, content is generously padded and breathes.
*/
export function ExperimentCard({
  step,
  agent,
  title,
  description,
  empty,
  emptyHint,
  children,
}: Props) {
  return (
    <section
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-surface-2/50",
        "transition-colors hover:border-border-strong",
        empty && "opacity-70"
      )}
    >
      {/* Left rail — step indicator. */}
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 px-5 pt-5">
        <div
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface-3/60 font-mono text-[11px] tabular-nums text-muted-foreground-strong"
        >
          {step}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-medium tracking-tight text-foreground">
              {title}
            </h3>
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2/80 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground-strong">
              <span className="h-1 w-1 rounded-full bg-accent" />
              {agent}
            </span>
          </div>
          {description && (
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="grid grid-cols-[auto_1fr] gap-x-4">
          <div className="hidden h-full w-6 sm:block">
            {/* Agent rail — connects steps visually like a timeline. */}
            <div className="mx-auto h-full w-px bg-gradient-to-b from-border to-transparent" />
          </div>
          <div className="col-span-2 sm:col-span-1 min-w-0 overflow-x-auto">
            {empty ? (
              <div className="dot-bg rounded-lg border border-dashed border-border bg-surface-2/30 px-5 py-8 text-center text-[12.5px] text-muted-foreground">
                {emptyHint ?? "Aún no corrió este agente."}
              </div>
            ) : (
              children
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
