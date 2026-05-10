"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, LayoutDashboard, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Org = { id: string; name: string; slug: string } | null;
type SidebarExperiment = { experiment_id: string; status: string };

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "", icon: LayoutDashboard, exact: true },
  { label: "Nuevo experimento", href: "/experiments/new", icon: Plus },
];

const STATUS_DOT: Record<string, string> = {
  designing: "bg-muted-foreground/40",
  implementing: "bg-blue-400",
  running: "bg-blue-500",
  analyzing: "bg-yellow-400",
  shipped: "bg-blue-400",
  consolidating: "bg-yellow-400",
  consolidated: "bg-green-500",
  killed: "bg-red-500",
};

export function Sidebar({
  org,
  experiments = [],
}: {
  org: Org;
  experiments?: SidebarExperiment[];
}) {
  const pathname = usePathname();
  const slug = org?.slug ?? "";
  const orgRoot = `/${slug}`;

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-background">
      <div className="flex h-14 items-center border-b px-6">
        <Link href={orgRoot} className="flex items-center" aria-label="Helix">
          <Image
            src="/helix-brand-assets/svg/lockup-horizontal-transparent-dark.svg"
            alt="Helix"
            width={96}
            height={28}
            priority
          />
        </Link>
      </div>

      <nav className="space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const href = `${orgRoot}${item.href}`;
          const active = item.exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.label}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {experiments.length > 0 && (
        <div className="flex flex-1 flex-col overflow-hidden px-3 pb-2">
          <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Experimentos
          </p>
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {experiments.map((exp) => {
              const href = `${orgRoot}/experiments/${exp.experiment_id}`;
              const active =
                pathname === href || pathname.startsWith(`${href}/`);
              const dotColor =
                STATUS_DOT[exp.status] ?? "bg-muted-foreground/40";

              return (
                <Link
                  key={exp.experiment_id}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs transition-colors",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  <span
                    className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotColor)}
                  />
                  <span className="truncate font-mono">
                    {exp.experiment_id}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {experiments.length === 0 && <div className="flex-1" />}

      <div className="border-t p-3">
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
          <FlaskConical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <span className="text-xs text-muted-foreground">
            {org?.name ?? "No org"}
          </span>
        </div>
      </div>
    </aside>
  );
}
