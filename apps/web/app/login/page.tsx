"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

type Mode = "password" | "magic";

function safeNextPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/";
  }
  return value;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const next = safeNextPath(searchParams.get("next"));

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Signed in.");
    // Hard navigate so the next request includes the freshly-set Supabase
    // cookies. router.push + refresh races with cookie persistence on
    // Vercel cold starts, which redirects the user back to /login.
    window.location.replace(next);
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    const supabase = createBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
    toast.success("Magic link sent. Check your email.");
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-6">
      {/* Ambient grid backdrop. */}
      <div
        aria-hidden
        className="grid-bg pointer-events-none fixed inset-0 -z-10 opacity-70"
      />

      <div className="w-full max-w-[400px] space-y-7">
        {/* Brand — same mark as the favicon. */}
        <div className="space-y-3 text-center">
          <Image
            src="/helix-brand-assets/png/app-icon-512.png"
            alt="Helix"
            width={44}
            height={44}
            priority
            className="mx-auto h-11 w-11 rounded-lg"
          />
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Sign in to Helix
            </h1>
            <p className="text-[13.5px] text-muted-foreground">
              {mode === "password"
                ? "Use your email and password to continue."
                : "We'll email you a one-time link."}
            </p>
          </div>
        </div>

        {/* Card. */}
        <div className="rounded-xl border border-border bg-surface-2/60 p-6 shadow-card backdrop-blur-md">
          {sent ? (
            <div className="space-y-3 text-[13px]">
              <p className="font-medium text-foreground">Check your inbox.</p>
              <p className="text-muted-foreground">
                We sent a magic link to{" "}
                <span className="font-medium text-foreground">{email}</span>.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="-ml-3"
                onClick={() => {
                  setSent(false);
                  setMode("password");
                }}
              >
                Volver
              </Button>
            </div>
          ) : mode === "password" ? (
            <div className="space-y-4">
              <form onSubmit={handlePassword} className="space-y-4">
                <Field label="Email" htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </Field>
                <Field label="Password" htmlFor="password">
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </Field>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>

              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-border" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  o
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setMode("magic")}
              >
                Use magic link
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <form onSubmit={handleMagicLink} className="space-y-4">
                <Field label="Email" htmlFor="magic-email">
                  <Input
                    id="magic-email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </Field>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {loading ? "Sending..." : "Send magic link"}
                </Button>
              </form>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setMode("password")}
              >
                Use password instead
              </Button>
            </div>
          )}
        </div>

        <p className="text-center font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground/60">
          Self-driving feature flags · v0.1
        </p>
      </div>
      <Toaster />
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-[12px] font-medium text-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
