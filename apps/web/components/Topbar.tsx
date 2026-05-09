"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { OrgSwitcher } from "@/components/OrgSwitcher";

type User = { id: string; email: string; role: string } | null;
type Org = { id: string; name: string; slug: string } | null;

export function Topbar({ user, org }: { user: User; org: Org }) {
  const router = useRouter();

  const signOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-6">
      <OrgSwitcher org={org} />

      <div className="flex items-center gap-3">
        {user && (
          <div className="text-right text-xs">
            <div className="font-medium">{user.email}</div>
            <div className="text-muted-foreground capitalize">{user.role}</div>
          </div>
        )}
        <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
