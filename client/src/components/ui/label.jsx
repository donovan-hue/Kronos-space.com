import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * KRONOS Label — paridad con .k-field-label:
 * 0.82rem / 600 / letter-spacing 0.02em / plata suave.
 */
const Label = forwardRef(function Label({ className, ...props }, ref) {
  return (
    <label
      ref={ref}
      data-slot="label"
      className={cn(
        "text-[0.82rem] font-semibold tracking-[0.02em] text-secondary-foreground",
        className
      )}
      {...props}
    />
  );
});

export { Label };
