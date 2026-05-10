import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[112px] w-full rounded-lg border border-border-strong bg-surface-2/60 px-3.5 py-3 text-sm text-foreground leading-relaxed",
        "placeholder:text-muted-foreground/70",
        "transition-[border-color,box-shadow,background-color] duration-150",
        "hover:bg-surface-3/40",
        "focus-visible:outline-none focus-visible:border-accent/60 focus-visible:bg-surface-3/50",
        "focus-visible:ring-4 focus-visible:ring-accent-soft",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
