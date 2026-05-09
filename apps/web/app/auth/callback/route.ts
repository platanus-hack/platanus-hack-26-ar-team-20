import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: userRow } = await supabase
          .from("users")
          .select("organizations(slug)")
          .eq("id", user.id)
          .single<{ organizations: { slug: string } | null }>();

        const slug = userRow?.organizations?.slug;
        if (next === "/" && slug) {
          return NextResponse.redirect(`${origin}/${slug}`);
        }
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
