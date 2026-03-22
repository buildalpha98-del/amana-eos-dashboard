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
        "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full rounded-xl bg-card p-6 shadow-2xl",
        "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95",
        sizeClasses[size],
        className
      )}
    >
      {showClose && (
        <DialogPrimitive.Close aria-label="Close dialog" className="absolute top-4 right-4 p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface transition-colors">
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
