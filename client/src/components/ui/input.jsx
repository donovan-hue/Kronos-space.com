import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * KRONOS Input — base shadcn/ui, piel KRONOS.
 * Paridad visual con .k-text-input (chrome-minimal): negro con
 * gradiente de brillo sutil, filo cromado y glow blanco al enfocar.
 */
const Input = forwardRef(function Input({ className, type = "text", ...props }, ref) {
  return (
    <input
      type={type}
      ref={ref}
      data-slot="input"
      className={cn(
        "w-full min-h-11 rounded-md border border-border bg-k-input px-3.5 py-2.5 text-[0.92rem] text-foreground outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[#727272] shadow-[inset_0_1px_0_rgba(255,255,255,0.055),inset_0_16px_30px_rgba(255,255,255,0.014),0_10px_26px_rgba(0,0,0,0.46)] focus:border-[var(--k-border-glow)] focus:shadow-[0_0_0_1px_rgba(255,255,255,0.42),0_0_20px_rgba(255,255,255,0.11),inset_0_1px_0_rgba(255,255,255,0.08)] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});

export { Input };
