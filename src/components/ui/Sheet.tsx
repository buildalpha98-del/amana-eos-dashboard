"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

// ─── Root ────────────────────────────────────────────────────
interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function Sheet({ open, onOpenChange, children }: SheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 bg-black/30 z-40",
            "data-[state=open]:animate-in data-[state=open]:fade-in",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out"
          )}
        />
        {children}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ─── Content ─────────────────────────────────────────────────
interface SheetContentProps {
  children: React.ReactNode;
  className?: string;
  side?: "right" | "left";
  width?: string;
}

function SheetContent({
  children,
  className,
  side = "right",
  width = "max-w-lg",
}: SheetContentProps) {
  return (
    <DialogPrimitive.Content
      className={cn(
        "fixed inset-y-0 z-50 bg-card shadow-2xl flex flex-col",
        // Full width on mobile, constrained width on desktop
        "w-full max-md:max-w-none",
        width,
        side === "right" ? "right-0" : "left-0",
        side === "right"
          ? "data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right"
          : "data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left",
        "duration-200",
        className
      )}
    >
      {children}
    </DialogPrimitive.Content>
  );
}

// ─── Sub-components ──────────────────────────────────────────
function SheetClose(
  props: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
) {
  return <DialogPrimitive.Close {...props} />;
}

const SheetTitle = DialogPrimitive.Title;
const SheetDescription = DialogPrimitive.Description;

export { Sheet, SheetContent, SheetClose, SheetTitle, SheetDescription };
