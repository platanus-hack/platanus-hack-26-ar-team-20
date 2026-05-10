import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type VariantVerdict = {
  variant_key: string;
  is_control?: boolean;
  n?: number;
  conv?: number;
  rate?: number;
  p_better_than_control?: number;
  p_is_best?: number;
  guardrail_breach?: boolean;
  verdict?: string;
};

type Props = {
  variants: VariantVerdict[];
  winningVariant?: string | null;
  primaryKpi?: string | null;
};

function pct(rate: number | undefined): string {
  if (rate === undefined || rate === null || Number.isNaN(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function ppLift(
  variant: VariantVerdict,
  control: VariantVerdict | undefined
): { text: string; positive: boolean | null } {
  if (variant.is_control) return { text: "—", positive: null };
  if (
    !control ||
    variant.rate === undefined ||
    control.rate === undefined ||
    Number.isNaN(variant.rate) ||
    Number.isNaN(control.rate)
  ) {
    return { text: "—", positive: null };
  }
  const diff = (variant.rate - control.rate) * 100;
  const sign = diff > 0 ? "+" : "";
  return { text: `${sign}${diff.toFixed(1)}pp`, positive: diff > 0 };
}

function pBest(variant: VariantVerdict): string {
  const p = variant.p_is_best ?? variant.p_better_than_control;
  if (p === undefined || p === null) return "—";
  return p.toFixed(2);
}

type Tone = "winner" | "loser" | "control" | "neutral";

function rowTone(variant: VariantVerdict, isWinner: boolean): Tone {
  if (isWinner) return "winner";
  if (variant.verdict === "loser" || variant.guardrail_breach) return "loser";
  if (variant.is_control) return "control";
  return "neutral";
}

const ROW_TONE: Record<Tone, string> = {
  winner: "bg-success-soft/40",
  loser: "bg-danger-soft/30",
  control: "",
  neutral: "",
};

const VERDICT_TONE: Record<Tone, string> = {
  winner: "border-success/15 bg-success-soft text-success",
  loser: "border-danger/15 bg-danger-soft text-danger",
  control: "border-info/15 bg-info-soft text-info",
  neutral: "border-border bg-surface-2 text-muted-foreground-strong",
};

export function VariantTable({ variants, winningVariant, primaryKpi }: Props) {
  const control = variants.find((v) => v.is_control);

  return (
    <div className="space-y-3">
      {primaryKpi && (
        <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <span className="font-mono uppercase tracking-wider text-muted-foreground/70">
            primary kpi
          </span>
          <span className="font-mono text-foreground/90">{primaryKpi}</span>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-border bg-surface-2/30">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variant</TableHead>
              <TableHead className="text-right">n</TableHead>
              <TableHead className="text-right">conv</TableHead>
              <TableHead className="text-right">rate</TableHead>
              <TableHead className="text-right">lift</TableHead>
              <TableHead className="text-right">p(best)</TableHead>
              <TableHead>Verdict</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((v) => {
              const isWinner = winningVariant === v.variant_key;
              const tone = rowTone(v, isWinner);
              const lift = ppLift(v, control);
              const verdict = isWinner
                ? "winner"
                : v.verdict ?? (v.is_control ? "control" : "—");

              return (
                <TableRow key={v.variant_key} className={ROW_TONE[tone]}>
                  <TableCell className="font-mono text-[12px] text-foreground">
                    <div className="flex items-center gap-2">
                      <span>{v.variant_key}</span>
                      {v.is_control && (
                        <span className="rounded-md border border-info/20 bg-info-soft px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-info">
                          control
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-[12.5px] text-foreground/90">
                    {v.n ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-[12.5px] text-foreground/90">
                    {v.conv ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-[12.5px] text-foreground">
                    {pct(v.rate)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono tabular-nums text-[12.5px]",
                      lift.positive === true && "text-success",
                      lift.positive === false && "text-danger",
                      lift.positive === null && "text-muted-foreground/60"
                    )}
                  >
                    {lift.text}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-[12.5px] text-foreground/90">
                    {pBest(v)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider",
                        VERDICT_TONE[tone]
                      )}
                    >
                      {verdict}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
