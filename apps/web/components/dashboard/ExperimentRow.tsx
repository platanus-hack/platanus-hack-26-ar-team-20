"use client";

import { useRouter } from "next/navigation";
import { TableCell, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/dashboard/StatusBadge";

export type ExperimentRowData = {
  experimentId: string;
  repoFullName: string;
  variantsCount: number;
  daysLive: number;
  status: string;
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
      <TableCell className="text-muted-foreground">
        {experiment.repoFullName}
      </TableCell>
      <TableCell>{experiment.variantsCount}</TableCell>
      <TableCell>
        {experiment.daysLive}
        <span className="text-muted-foreground"> d</span>
      </TableCell>
      <TableCell>
        <StatusBadge status={experiment.status} />
      </TableCell>
    </TableRow>
  );
}
