import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "muted";

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-green-100 text-green-800 ring-green-200",
  warning: "bg-yellow-100 text-yellow-800 ring-yellow-200",
  danger: "bg-red-100 text-red-800 ring-red-200",
  info: "bg-blue-100 text-blue-800 ring-blue-200",
  muted: "bg-muted text-muted-foreground ring-border",
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
  const label = STATUS_LABEL[status] ?? status;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE_CLASS[tone]
      )}
    >
      <span
        className={cn(
          "mr-1.5 h-1.5 w-1.5 rounded-full",
          tone === "success" && "bg-green-500",
          tone === "warning" && "bg-yellow-500",
          tone === "danger" && "bg-red-500",
          tone === "info" && "bg-blue-500",
          tone === "muted" && "bg-muted-foreground/40"
        )}
      />
      {label}
    </span>
  );
}
