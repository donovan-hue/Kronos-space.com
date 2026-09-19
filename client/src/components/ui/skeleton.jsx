import { cn } from "@/lib/utils";

/**
 * KRONOS Skeleton — paridad con .k-skeleton:
 * plata translúcida con pulso monocromático (k-pulse).
 * Dimensiona con className (p. ej. "h-[18px] w-[min(520px,80%)]").
 */
function Skeleton({ className, ...props }) {
  return (
    <span
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("block animate-k-pulse rounded-full bg-white/[0.06]", className)}
      {...props}
    />
  );
}

export { Skeleton };
