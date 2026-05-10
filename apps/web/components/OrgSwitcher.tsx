"use client";

type Org = { id: string; name: string; slug: string } | null;

export function OrgSwitcher({ org }: { org: Org }) {
  if (!org) {
    return (
      <span className="inline-flex h-7 items-center rounded-md border border-border bg-surface-2 px-2.5 text-[12px] text-muted-foreground">
        No workspace
      </span>
    );
  }

  return (
    <div className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 text-[12.5px]">
      <span className="font-medium text-foreground">{org.name}</span>
      <span className="text-muted-foreground/50">/</span>
      <span className="font-mono text-[11.5px] text-muted-foreground">
        {org.slug}
      </span>
    </div>
  );
}
