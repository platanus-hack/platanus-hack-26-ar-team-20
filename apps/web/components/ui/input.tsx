import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-border-strong bg-surface-2/60 px-3 py-2 text-sm text-foreground",
        "placeholder:text-muted-foreground/80",
        "transition-[border-color,box-shadow,background-color] duration-150",
        "hover:border-border-strong hover:bg-surface-3/40",
        "focus-visible:outline-none focus-visible:border-accent/60 focus-visible:bg-surface-3/50",
        "focus-visible:ring-4 focus-visible:ring-accent-soft",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
