import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "press-feedback inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-md text-sm font-medium tracking-tight",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        // Primary — high-contrast white on dark, like Vercel/Linear primary CTAs.
        default: [
          "bg-foreground text-background",
          "hover:bg-foreground/90",
          "shadow-[0_1px_0_0_oklch(1_0_0_/_0.18)_inset,0_1px_2px_0_oklch(0_0_0_/_0.5)]",
        ].join(" "),
        // Accent — rare, AI / agent-related actions.
        accent: [
          "bg-accent text-accent-foreground",
          "hover:bg-accent/92",
          "shadow-[0_1px_0_0_oklch(1_0_0_/_0.18)_inset,0_0_0_1px_var(--accent-soft-strong)]",
        ].join(" "),
        destructive: [
          "bg-danger text-foreground",
          "hover:bg-danger/90",
          "shadow-[0_1px_0_0_oklch(1_0_0_/_0.12)_inset]",
        ].join(" "),
        // Outline — premium glass-edge button, the workhorse for secondary actions.
        outline: [
          "border border-border-strong bg-surface-2/40",
          "text-foreground",
          "hover:bg-surface-3/60 hover:border-border-strong",
          "shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)]",
        ].join(" "),
        secondary: [
          "bg-surface-3 text-foreground",
          "hover:bg-surface-3/80",
        ].join(" "),
        ghost: [
          "text-muted-foreground-strong",
          "hover:bg-surface-3/60 hover:text-foreground",
        ].join(" "),
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-5",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
