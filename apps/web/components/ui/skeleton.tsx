import * as React from "react";
import { cn } from "@/lib/utils";

/*
  Premium shimmer skeleton — calm, slow, low contrast.
  Sized to match the real layout it stands in for.
*/
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "shimmer relative overflow-hidden rounded-md bg-surface-3/40",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
