"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Size map ────────────────────────────────────────────────
const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  full: "max-w-3xl",
} as const;

// ─── Root ────────────────────────────────────────────────────
interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 z-50 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        {children}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ─── Content ─────────────────────────────────────────────────
// Desktop: centered modal with zoom animation
// Mobile: bottom sheet with slide-up animation + drag handle
interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
  size?: keyof typeof sizeClasses;
  showClose?: boolean;
}

function DialogContent({
  children,
  className,
  size = "md",
  showClose = true,
}: DialogContentProps) {
  return (
    <DialogPrimitive.Content
      className={cn(
        // Desktop: centered modal
        "fixed z-50 w-full bg-card shadow-2xl",
        "md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:p-6",
        "md:data-[state=open]:animate-in md:data-[state=open]:fade-in md:data-[state=open]:zoom-in-95",
        "md:data-[state=closed]:animate-out md:data-[state=closed]:fade-out md:data-[state=closed]:zoom-out-95",
        // Mobile: bottom sheet
        "max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-2xl max-md:p-5 max-md:pt-3 max-md:max-h-[85vh] max-md:overflow-y-auto",
        "max-md:data-[state=open]:animate-in max-md:data-[state=open]:fade-in max-md:data-[state=open]:slide-in-from-bottom",
        "max-md:data-[state=closed]:animate-out max-md:data-[state=closed]:fade-out max-md:data-[state=closed]:slide-out-to-bottom",
        sizeClasses[size],
        className
      )}
      style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
    >
      {/* Mobile drag handle */}
      <div className="flex justify-center pb-3 md:hidden">
        <div className="w-10 h-1 rounded-full bg-border" />
      </div>
      {showClose && (
        <DialogPrimitive.Close aria-label="Close dialog" className="absolute top-4 right-4 p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface transition-colors max-md:top-3 max-md:right-3">
          <X className="w-4 h-4" />
        </DialogPrimitive.Close>
      )}
      {children}
    </DialogPrimitive.Content>
  );
}

// ─── Sub-components ──────────────────────────────────────────
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;
const DialogClose = DialogPrimitive.Close;

export { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose };
