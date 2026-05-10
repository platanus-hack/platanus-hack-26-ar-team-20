import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "muted";

const TONE_CLASS: Record<Tone, { wrap: string; dot: string; pulse: boolean }> = {
  success: {
    wrap: "border-success/15 bg-success-soft text-success",
    dot: "bg-success",
    pulse: false,
  },
  warning: {
    wrap: "border-warning/15 bg-warning-soft text-warning",
    dot: "bg-warning",
    pulse: true,
  },
  danger: {
    wrap: "border-danger/15 bg-danger-soft text-danger",
    dot: "bg-danger",
    pulse: false,
  },
  info: {
    wrap: "border-info/15 bg-info-soft text-info",
    dot: "bg-info",
    pulse: true,
  },
  muted: {
    wrap: "border-border bg-surface-2/60 text-muted-foreground-strong",
    dot: "bg-muted-foreground/50",
    pulse: false,
  },
};

const STATUS_TONE: Record<string, Tone> = {
  designing: "muted",
  implementing: "info",
  running: "info",
  analyzing: "warning",
  shipped: "info",
  consolidating: "warning",
  consolidated: "success",
  killed: "danger",
};

// Friendly labels exposed in the dashboard. We intentionally relabel
// `shipped` → "Esperando resultados" because Director ships the winner to
// 100% but the experiment is still gathering downstream metrics for ~7
// days — the team is "waiting for the real-world confirmation", not done.
const STATUS_LABEL: Record<string, string> = {
  designing: "Designing",
  implementing: "Implementing",
  running: "Running",
  analyzing: "Analyzing",
  shipped: "Esperando resultados",
  consolidating: "Consolidating",
  consolidated: "Shipped",
  killed: "Killed",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "muted";
  const t = TONE_CLASS[tone];
  const label = STATUS_LABEL[status] ?? status;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium tracking-tight",
        t.wrap
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full text-current",
          t.dot,
          t.pulse && "pulse-dot"
        )}
        style={{ color: "currentColor" }}
      />
      {label}
    </span>
  );
}
