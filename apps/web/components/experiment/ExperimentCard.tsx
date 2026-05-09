import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  step: 1 | 2 | 3 | 4 | 5;
  agent: string;
  title: string;
  description?: string;
  empty?: boolean;
  emptyHint?: string;
  children?: React.ReactNode;
};

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
    <Card className={cn(empty && "opacity-60")}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-full border bg-muted text-xs font-semibold tabular-nums"
          >
            {step}
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">{title}</CardTitle>
            {description && (
              <CardDescription className="mt-0.5">{description}</CardDescription>
            )}
          </div>
          <span className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {agent}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {emptyHint ?? "Aún no corrió este agente."}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
