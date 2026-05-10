"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";
const STORAGE_KEY = "helix-theme";

/*
  Toggles between dark and light. The initial theme is set by the
  inline <head> script in app/layout.tsx, so we read from the DOM
  on mount to avoid hydration mismatch.
*/
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setMounted(true);
    setTheme(
      document.documentElement.classList.contains("dark") ? "dark" : "light"
    );
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage may be unavailable (private mode, embedded). */
    }
  };

  // Reserve space during SSR / pre-mount so the topbar layout stays stable.
  if (!mounted) {
    return <span aria-hidden className="inline-block h-8 w-8" />;
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`${theme === "dark" ? "Light" : "Dark"} mode`}
    >
      {theme === "dark" ? (
        <Sun className="h-3.5 w-3.5" strokeWidth={2} />
      ) : (
        <Moon className="h-3.5 w-3.5" strokeWidth={2} />
      )}
    </Button>
  );
}
