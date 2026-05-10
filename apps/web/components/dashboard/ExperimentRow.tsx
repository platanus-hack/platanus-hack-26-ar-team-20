"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight, GitPullRequest, Github } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/dashboard/StatusBadge";

export type ExperimentRowData = {
  experimentId: string;
  repoFullName: string;
  variantsCount: number;
  daysLive: number;
  status: string;
  prUrl: string | null;
};

export function ExperimentRow({
  experiment,
  orgSlug,
}: {
  experiment: ExperimentRowData;
  orgSlug: string;
}) {
  const router = useRouter();
  const href = `/${orgSlug}/experiments/${experiment.experimentId}`;
  const repoUrl =
    experiment.repoFullName !== "—"
      ? `https://github.com/${experiment.repoFullName}`
      : null;

  return (
    <TableRow
      onClick={() => router.push(href)}
      className="group cursor-pointer"
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
    >
      <TableCell className="font-mono text-[12px] text-foreground">
        <span className="inline-flex items-center gap-1.5">
          {experiment.experimentId}
          <ArrowUpRight
            className="h-3 w-3 -translate-x-1 text-muted-foreground/0 transition-all group-hover:translate-x-0 group-hover:text-muted-foreground"
            strokeWidth={2}
          />
        </span>
      </TableCell>
      <TableCell>
        {repoUrl ? (
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2/40 px-1.5 py-0.5 font-mono text-[11px] text-foreground transition-colors hover:border-border-strong hover:bg-surface-3/40"
          >
            <Github className="h-3 w-3 shrink-0" strokeWidth={2} />
            {experiment.repoFullName}
          </a>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </TableCell>
      <TableCell className="font-mono tabular-nums text-[13px] text-foreground/90">
        {experiment.variantsCount}
      </TableCell>
      <TableCell className="font-mono tabular-nums text-[13px] text-foreground/90">
        {experiment.daysLive}
        <span className="text-muted-foreground/60"> d</span>
      </TableCell>
      <TableCell>
        <StatusBadge status={experiment.status} />
      </TableCell>
      <TableCell>
        {experiment.prUrl ? (
          <a
            href={experiment.prUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2/40 px-1.5 py-0.5 text-[11px] text-foreground transition-colors hover:border-border-strong hover:bg-surface-3/40"
          >
            <GitPullRequest className="h-3 w-3" strokeWidth={2} />
            PR
          </a>
        ) : (
          <span className="text-[11px] text-muted-foreground/60">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
