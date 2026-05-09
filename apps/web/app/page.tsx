import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: userRow } = await supabase
    .from("users")
    .select("organizations(slug)")
    .eq("id", user.id)
    .single<{ organizations: { slug: string } | null }>();

  const slug = userRow?.organizations?.slug;
  if (!slug) redirect("/login");

  redirect(`/${slug}`);
}
