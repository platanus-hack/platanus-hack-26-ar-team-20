"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bot, LayoutGrid, LogOut, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { createBrowserClient } from "@/lib/supabase/client";

type Org = { id: string; name: string; slug: string } | null;
type SidebarUser = { id: string; email: string; role: string } | null;
type SidebarExperiment = { experiment_id: string; status: string };

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutGrid;
  exact?: boolean;
  hint?: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "", icon: LayoutGrid, exact: true, hint: "G" },
  {
    label: "New experiment",
    href: "/experiments/new",
    icon: Plus,
    hint: "N",
  },
  {
    label: "Agents",
    href: "/agents",
    icon: Bot,
    hint: "A",
  },
];

/*
  Status → tinted dot. The "live" agent states get a breathing pulse so
  the sidebar communicates motion without ever feeling busy.
*/
const STATUS_DOT: Record<string, { color: string; pulse: boolean }> = {
  designing: { color: "text-muted-foreground/60", pulse: false },
  implementing: { color: "text-info", pulse: true },
  running: { color: "text-info", pulse: true },
  analyzing: { color: "text-warning", pulse: true },
  shipped: { color: "text-info", pulse: true },
  consolidating: { color: "text-warning", pulse: true },
  consolidated: { color: "text-success", pulse: false },
  killed: { color: "text-danger", pulse: false },
};

export function Sidebar({
  org,
  user,
  experiments = [],
}: {
  org: Org;
  user: SidebarUser;
  experiments?: SidebarExperiment[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const slug = org?.slug ?? "";
  const orgRoot = `/${slug}`;

  const signOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="flex h-screen w-[244px] shrink-0 flex-col border-r border-border bg-surface-1/40">
      {/* Brand block — quiet wordmark, like Linear's logo lockup. */}
      <div className="flex h-14 items-center gap-2.5 px-5">
        <Link
          href={orgRoot}
          aria-label="Helix"
          className="group flex items-center gap-2"
        >
          <Image
            src="/helix-brand-assets/png/app-icon-512.png"
            alt=""
            width={24}
            height={24}
            priority
            className="h-6 w-6 rounded-md"
          />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Helix
          </span>
        </Link>
        <span className="ml-auto inline-flex h-5 items-center gap-1 rounded-md border border-border bg-surface-2/60 px-1.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground-strong">
          <span className="h-1 w-1 rounded-full bg-success" />
          beta
        </span>
      </div>

      {/* Primary nav. */}
      <nav className="space-y-0.5 px-3 pt-2">
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
                "group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                active
                  ? "bg-surface-3/60 text-foreground"
                  : "text-muted-foreground-strong hover:bg-surface-3/40 hover:text-foreground"
              )}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-4 w-[2px] -translate-x-3 -translate-y-1/2 rounded-r-full bg-foreground/80"
                />
              )}
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span className="flex-1 truncate">{item.label}</span>
              {item.hint && (
                <Kbd className="opacity-0 transition-opacity group-hover:opacity-100">
                  {item.hint}
                </Kbd>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Experiments — list of agent runs. */}
      {experiments.length > 0 ? (
        <div className="mt-6 flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 pb-2">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
              Experiments
            </p>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
              {experiments.length}
            </span>
          </div>
          <div className="flex-1 space-y-px overflow-y-auto px-3 pb-3">
            {experiments.map((exp) => {
              const href = `${orgRoot}/experiments/${exp.experiment_id}`;
              const active =
                pathname === href || pathname.startsWith(`${href}/`);
              const dot =
                STATUS_DOT[exp.status] ?? STATUS_DOT.designing;

              return (
                <Link
                  key={exp.experiment_id}
                  href={href}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                    active
                      ? "bg-surface-3/60 text-foreground"
                      : "text-muted-foreground-strong hover:bg-surface-3/40 hover:text-foreground"
                  )}
                >
                  <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full bg-current",
                        dot.color,
                        dot.pulse && "pulse-dot"
                      )}
                    />
                  </span>
                  <span className="truncate font-mono text-[11.5px]">
                    {exp.experiment_id}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Footer — user identity + sign-out. */}
      {user && (
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2/40 px-2 py-1.5">
            <SidebarAvatar email={user.email} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium leading-tight text-foreground">
                {user.email}
              </div>
              <div className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
                {user.role}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
              className="-mr-0.5 h-7 w-7 shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}

function SidebarAvatar({ email }: { email: string }) {
  const initial = email?.[0]?.toUpperCase() ?? "·";
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface-3 text-[11px] font-medium text-foreground"
    >
      {initial}
    </span>
  );
}

