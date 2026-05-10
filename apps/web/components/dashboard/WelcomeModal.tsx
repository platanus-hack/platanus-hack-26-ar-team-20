"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
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

const TOTAL_MS = 5000;

const STEPS = [
  "Cloning JoaquinGiorgis/helix-demo-saas",
  "Indexando feature_state y flags activos en PostHog",
  "Leyendo KPIs disponibles del producto",
  "Detectando oportunidades en el funnel",
] as const;

const STEP_INTERVAL = TOTAL_MS / STEPS.length;

// Controlled "Helix is reading your repo" intro. The parent decides when
// to show it (e.g. only when entering the demo experiment) and gets a
// callback when the 5s indexing animation finishes — typically used to
// chain into RunAllModal.
export function WelcomeModal({
  open,
  onComplete,
}: {
  open: boolean;
  onComplete: () => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      // Reset between opens so a re-trigger (e.g. after a /reset) plays
      // the indexing animation from scratch.
      setStepIdx(0);
      setProgress(0);
      startedAtRef.current = null;
      completedRef.current = false;
      return;
    }

    startedAtRef.current = Date.now();

    const stepTimer = setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
    }, STEP_INTERVAL);

    const progressTimer = setInterval(() => {
      if (startedAtRef.current === null) return;
      const elapsed = Date.now() - startedAtRef.current;
      setProgress(Math.min(100, (elapsed / TOTAL_MS) * 100));
    }, 60);

    const completeTimer = setTimeout(() => {
      setProgress(100);
      setStepIdx(STEPS.length - 1);
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
    }, TOTAL_MS);

    return () => {
      clearInterval(stepTimer);
      clearInterval(progressTimer);
      clearTimeout(completeTimer);
    };
  }, [open, onComplete]);

  const skip = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // The intro is intentionally non-dismissable except via "Saltar".
        if (!next) return;
      }}
    >
      <DialogContent className="max-w-md gap-6 [&>button]:hidden">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Github className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
            <DialogTitle>Helix está leyendo tu repo</DialogTitle>
          </div>
          <DialogDescription>
            Generando recomendaciones de features para Team20.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Progress rail — slim and elegant. */}
          <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-foreground transition-[width] duration-200 ease-linear"
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
                    "flex items-center gap-2.5 text-[13px] transition-colors",
                    done && "text-foreground",
                    active && "text-foreground",
                    !done && !active && "text-muted-foreground/70"
                  )}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {done ? (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success-soft text-success">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    ) : active ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin text-accent"
                        strokeWidth={2}
                      />
                    ) : (
                      <span className="h-2 w-2 rounded-full border border-border-strong" />
                    )}
                  </span>
                  <span>{step}</span>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between border-t border-border pt-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-accent" strokeWidth={2} />
              <span className="font-mono uppercase tracking-wider">
                Indexer · Brief · Pulse
              </span>
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
