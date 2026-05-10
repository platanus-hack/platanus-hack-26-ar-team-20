"use client";

import { useRouter } from "next/navigation";
import { Github } from "lucide-react";
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
  const repoUrl = experiment.repoFullName !== "—"
    ? `https://github.com/${experiment.repoFullName}`
    : null;

  return (
    <TableRow
      onClick={() => router.push(href)}
      className="cursor-pointer"
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
    >
      <TableCell className="font-mono text-xs">
        {experiment.experimentId}
      </TableCell>
      <TableCell>
        {repoUrl ? (
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs text-foreground hover:bg-accent transition-colors"
          >
            <Github className="h-3 w-3 shrink-0" />
            {experiment.repoFullName}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>{experiment.variantsCount}</TableCell>
      <TableCell>
        {experiment.daysLive}
        <span className="text-muted-foreground"> d</span>
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
            className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-foreground hover:bg-accent transition-colors"
          >
            <Github className="h-3 w-3 shrink-0" />
            PR
          </a>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
