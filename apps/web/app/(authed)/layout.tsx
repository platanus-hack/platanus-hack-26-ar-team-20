import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Toaster } from "@/components/ui/sonner";

type UserRow = {
  id: string;
  email: string;
  role: string;
  organizations: { id: string; name: string; slug: string } | null;
};

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: userRow } = await supabase
    .from("users")
    .select("id, email, role, organizations(id, name, slug)")
    .eq("id", user.id)
    .single<UserRow>();

  const org = userRow?.organizations ?? null;
  const userInfo = userRow
    ? { id: userRow.id, email: userRow.email, role: userRow.role }
    : { id: user.id, email: user.email ?? "", role: "viewer" };

  const { data: sidebarExps } = await supabase
    .from("experiments")
    .select("experiment_id, status")
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(20);

  const experiments = (sidebarExps ?? []) as { experiment_id: string; status: string }[];

  return (
    <div className="flex h-screen">
      <Sidebar org={org} experiments={experiments} />
      <div className="flex flex-1 flex-col">
        <Topbar user={userInfo} org={org} />
        <main className="flex-1 overflow-auto bg-muted/30 p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
