import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * KRONOS Button — base shadcn/ui, piel KRONOS.
 * Paridad visual con .k-button / .k-button-primary / .k-button-secondary /
 * .k-button-ghost / .k-button-danger (design-system + chrome-minimal):
 * píldora 44px, material cromo espejo en primario, negro con filo cromado
 * en secundario. Peligro plata (identidad monocromática).
 */
const buttonVariants = cva(
  // Base — .k-button
  "inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border font-medium outline-none transition-[transform,border-color,box-shadow,background-image] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Cromo espejo — .k-button-primary
        default:
          "min-h-11 border-white/80 bg-k-chrome-btn px-4 text-sm font-extrabold text-primary-foreground [text-shadow:0_1px_0_rgba(255,255,255,0.45)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-12px_18px_rgba(0,0,0,0.28),0_12px_30px_rgba(0,0,0,0.72)] hover:-translate-y-px hover:bg-k-chrome-btn-hover hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-12px_18px_rgba(0,0,0,0.28),0_12px_30px_rgba(0,0,0,0.72),0_0_18px_rgba(255,255,255,0.13)]",
        // Negro con filo cromado — .k-button-secondary
        secondary:
          "min-h-11 bg-k-btn-soft px-4 text-sm text-secondary-foreground hover:-translate-y-px hover:border-[var(--k-border-glow)] hover:text-foreground hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_15px_34px_rgba(0,0,0,0.78),0_0_18px_rgba(255,255,255,0.13)]",
        // Fantasma — .k-button-ghost
        ghost:
          "min-h-11 bg-transparent px-4 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground",
        // Peligro plata — .k-button-danger (KRONOS: sin rojo)
        destructive:
          "min-h-11 border-white/35 bg-k-btn-soft px-4 text-sm text-[#d7d7d7] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05),0_10px_24px_rgba(0,0,0,0.72)] hover:-translate-y-px hover:border-[var(--k-border-glow)] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05),0_15px_34px_rgba(0,0,0,0.78),0_0_18px_rgba(255,255,255,0.13)]",
        link: "border-transparent bg-transparent px-0 text-sm text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "",
        sm: "min-h-9 px-3.5 text-xs",
        lg: "min-h-12 px-6 text-base",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = forwardRef(function Button(
  { className, variant, size, asChild = false, ...props },
  ref
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export { Button, buttonVariants };
