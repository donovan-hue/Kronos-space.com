import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * KRONOS Badge — estados y etiquetas en píldora.
 * success y destructive comparten la plata KRONOS: la identidad es
 * monocromática por diseño (ORDEN 00 — sin colores semánticos).
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-white/40 bg-white/[0.06] text-white/90",
        secondary: "border-border bg-k-btn-soft text-secondary-foreground",
        outline: "border-border bg-transparent text-foreground",
        success: "border-[#d7d7d7] bg-[rgba(215,215,215,0.08)] text-[#d7d7d7]",
        destructive: "border-[#d7d7d7] bg-[rgba(215,215,215,0.08)] text-[#d7d7d7]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
