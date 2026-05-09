"use client";

import { Badge } from "@/components/ui/badge";

type Org = { id: string; name: string; slug: string } | null;

export function OrgSwitcher({ org }: { org: Org }) {
  if (!org) {
    return (
      <Badge variant="outline" className="font-normal">
        No organization
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm">
      <span className="font-medium">{org.name}</span>
      <span className="text-muted-foreground">/{org.slug}</span>
    </div>
  );
}
