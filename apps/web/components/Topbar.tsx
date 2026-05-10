"use client";

import { ThemeToggle } from "@/components/ThemeToggle";

type Org = { id: string; name: string; slug: string } | null;

export function Topbar({ org }: { org: Org }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <Breadcrumb org={org} />
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}

function Breadcrumb({ org }: { org: Org }) {
  if (!org) {
    return (
      <span className="text-sm text-muted-foreground">No workspace</span>
    );
  }
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-[13px]"
    >
      <span className="font-medium text-foreground">{org.name}</span>
      <span className="text-muted-foreground/50">/</span>
      <span className="font-mono text-[12px] text-muted-foreground">
        {org.slug}
      </span>
    </nav>
  );
}
