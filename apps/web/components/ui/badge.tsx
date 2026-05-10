import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
  Status pill — minimalist, monochrome by default. Tone variants apply
  a soft tinted background + matched text/border. Never neon, never loud.
*/
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "border-border-strong bg-surface-2 text-foreground-secondary",
        outline: "border-border-strong bg-transparent text-foreground-secondary",
        muted: "border-transparent bg-surface-3 text-muted-foreground-strong",
        accent: "border-transparent bg-accent-soft text-accent",
        success: "border-transparent bg-success-soft text-success",
        warning: "border-transparent bg-warning-soft text-warning",
        danger: "border-transparent bg-danger-soft text-danger",
        info: "border-transparent bg-info-soft text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
