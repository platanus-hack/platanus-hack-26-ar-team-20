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
): string {
  if (variant.is_control) return "—";
  if (
    !control ||
    variant.rate === undefined ||
    control.rate === undefined ||
    Number.isNaN(variant.rate) ||
    Number.isNaN(control.rate)
  ) {
    return "—";
  }
  const diff = (variant.rate - control.rate) * 100;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(1)}pp`;
}

function pBest(variant: VariantVerdict): string {
  const p = variant.p_is_best ?? variant.p_better_than_control;
  if (p === undefined || p === null) return "—";
  return p.toFixed(2);
}

function rowTone(
  variant: VariantVerdict,
  isWinner: boolean
): { row: string; verdict: string } {
  if (isWinner)
    return {
      row: "bg-green-50/60 hover:bg-green-50",
      verdict: "text-green-800 bg-green-100 ring-green-200",
    };
  if (variant.verdict === "loser" || variant.guardrail_breach)
    return {
      row: "bg-red-50/40 hover:bg-red-50",
      verdict: "text-red-800 bg-red-100 ring-red-200",
    };
  if (variant.is_control)
    return {
      row: "",
      verdict: "text-blue-800 bg-blue-100 ring-blue-200",
    };
  return {
    row: "",
    verdict: "text-muted-foreground bg-muted ring-border",
  };
}

export function VariantTable({ variants, winningVariant, primaryKpi }: Props) {
  const control = variants.find((v) => v.is_control);

  return (
    <div className="space-y-2">
      {primaryKpi && (
        <p className="text-xs text-muted-foreground">
          Primary KPI ·{" "}
          <span className="font-mono text-foreground">{primaryKpi}</span>
        </p>
      )}
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
            const verdict = isWinner
              ? "winner"
              : v.verdict ?? (v.is_control ? "control" : "—");

            return (
              <TableRow key={v.variant_key} className={tone.row}>
                <TableCell className="font-mono text-xs">
                  {v.variant_key}
                  {v.is_control && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      control
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {v.n ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {v.conv ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(v.rate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {ppLift(v, control)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pBest(v)}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset",
                      tone.verdict
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
  );
}
