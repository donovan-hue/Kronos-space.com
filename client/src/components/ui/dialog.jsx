import { forwardRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * KRONOS Dialog — shadcn/ui sobre Radix.
 * Reemplaza los modales hechos a mano (.k-modal-backdrop + .k-modal):
 * foco atrapado, Escape, clic en el fondo, restauración de foco y
 * bloqueo de scroll — accesibilidad probada sin código manual.
 * Piel KRONOS: fondo negro, filo cromado, backdrop glassmorphism
 * (blur 14px, rgba(0,0,0,0.75) — paridad con chrome-minimal).
 */
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = forwardRef(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-[59] bg-black/75 backdrop-blur-[14px] backdrop-saturate-0 data-[state=open]:animate-k-fade-in data-[state=closed]:animate-k-fade-out",
        className
      )}
      {...props}
    />
  );
});

const DialogContent = forwardRef(function DialogContent(
  { className, children, showCloseButton = true, ...props },
  ref
) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-slot="dialog-content"
        className={cn(
          "fixed left-1/2 top-1/2 z-[60] grid w-[min(520px,calc(100vw-40px))] -translate-x-1/2 -translate-y-1/2 gap-3 rounded-lg border border-border bg-black p-5 shadow-k-lg data-[state=open]:animate-k-zoom-in data-[state=closed]:animate-k-zoom-out",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label="Cerrar"
            className="absolute right-4 top-4 grid size-8 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-white/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

const DialogHeader = forwardRef(function DialogHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="dialog-header"
      className={cn("grid gap-1.5 pr-8", className)}
      {...props}
    />
  );
});

const DialogTitle = forwardRef(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      data-slot="dialog-title"
      className={cn("text-lg font-bold text-foreground", className)}
      {...props}
    />
  );
});

const DialogDescription = forwardRef(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
});

const DialogFooter = forwardRef(function DialogFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
});

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
