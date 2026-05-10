"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-surface-2 group-[.toaster]:text-foreground group-[.toaster]:border-border-strong group-[.toaster]:rounded-lg group-[.toaster]:shadow-pop group-[.toaster]:backdrop-blur-md",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-foreground group-[.toast]:text-background group-[.toast]:rounded-md",
          cancelButton:
            "group-[.toast]:bg-surface-3 group-[.toast]:text-muted-foreground group-[.toast]:rounded-md",
          success: "group-[.toaster]:[--success-bg:var(--success-soft)]",
          error: "group-[.toaster]:[--error-bg:var(--danger-soft)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
