import * as React from "react";
import { cn } from "@/lib/utils";

/*
  Inline keyboard hint — 1 char per <Kbd>. Used in command palette,
  tooltips and nav items to communicate AI-native shortcut affordances.
*/
function Kbd({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-border-strong bg-surface-2 px-1 font-mono text-[10px] font-medium leading-none text-muted-foreground-strong",
        "shadow-[inset_0_-1px_0_0_oklch(0_0_0_/_0.3)]",
        className
      )}
      {...props}
    />
  );
}

export { Kbd };
