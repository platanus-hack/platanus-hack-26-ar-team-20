"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FlaskConical,
  Flag,
  ScrollText,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Org = { id: string; name: string; slug: string } | null;
type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "", icon: LayoutDashboard, exact: true },
  { label: "Experiments", href: "/experiments", icon: FlaskConical },
  { label: "Features", href: "/features", icon: Flag },
  { label: "Audit", href: "/audit", icon: ScrollText },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({ org }: { org: Org }) {
  const pathname = usePathname();
  const slug = org?.slug ?? "";
  const orgRoot = `/${slug}`;

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-background">
      <div className="flex h-14 items-center border-b px-6">
        <Link href={orgRoot} className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-primary" />
          <span className="text-sm font-semibold">Helix</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-3">
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

      <div className="border-t p-3">
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {org?.name ?? "No org"}
        </div>
      </div>
    </aside>
  );
}
