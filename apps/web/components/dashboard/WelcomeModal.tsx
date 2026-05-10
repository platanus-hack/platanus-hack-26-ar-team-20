"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Github,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "helix:welcomed";
const TOTAL_MS = 5000;

const STEPS = [
  "Cloning JoaquinGiorgis/helix-demo-saas...",
  "Indexando feature_state y flags activos en PostHog...",
  "Leyendo KPIs disponibles del producto...",
  "Detectando oportunidades en el funnel...",
] as const;

const STEP_INTERVAL = TOTAL_MS / STEPS.length;

export function WelcomeModal({
  experimentSlug,
  orgSlug,
}: {
  experimentSlug: string;
  orgSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY) === "1") return;
    sessionStorage.setItem(STORAGE_KEY, "1");
    setOpen(true);
    startedAtRef.current = Date.now();

    const stepTimer = setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
    }, STEP_INTERVAL);

    const progressTimer = setInterval(() => {
      if (startedAtRef.current === null) return;
      const elapsed = Date.now() - startedAtRef.current;
      setProgress(Math.min(100, (elapsed / TOTAL_MS) * 100));
    }, 60);

    const redirectTimer = setTimeout(() => {
      setProgress(100);
      setStepIdx(STEPS.length - 1);
      // The `autorun` flag tells ExperimentClient to immediately open the
      // run-all modal so the user doesn't have to click "Run full loop"
      // after the intro animation.
      router.push(
        `/${orgSlug}/experiments/${experimentSlug}?autorun=1`
      );
    }, TOTAL_MS);

    return () => {
      clearInterval(stepTimer);
      clearInterval(progressTimer);
      clearTimeout(redirectTimer);
    };
  }, [orgSlug, experimentSlug, router]);

  const skip = () => {
    setOpen(false);
    router.push(
      `/${orgSlug}/experiments/${experimentSlug}?autorun=1`
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let escape/click-outside close it; "Saltar" is the only way out.
        if (!next) return;
      }}
    >
      <DialogContent className="max-w-md [&>button]:hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-4 w-4 animate-pulse" />
            Helix está leyendo tu repo
          </DialogTitle>
          <DialogDescription>
            Generando recomendaciones de features para Team20.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 bg-foreground transition-[width] duration-200 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>

          <ul className="space-y-2">
            {STEPS.map((step, idx) => {
              const done = idx < stepIdx;
              const active = idx === stepIdx;
              return (
                <li
                  key={step}
                  className={cn(
                    "flex items-center gap-2 text-sm transition-colors",
                    done && "text-foreground",
                    active && "font-medium text-foreground",
                    !done && !active && "text-muted-foreground"
                  )}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                  ) : (
                    <div className="h-4 w-4 shrink-0 rounded-full border" />
                  )}
                  <span>{step}</span>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Indexer · Brief · Pulse
            </span>
            <Button variant="ghost" size="sm" onClick={skip}>
              Saltar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
