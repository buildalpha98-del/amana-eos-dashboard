"use client";

import {
  CheckSquare,
  AlertCircle,
  Mountain,
  Upload,
  Plane,
  Receipt,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useQuickAdd } from "@/components/quick-add/QuickAddProvider";
import { useEscapeClose } from "@/hooks/useEscapeClose";

export interface QuickAddMenuPosition {
  top: number;
  right: number;
}

export function QuickAddMenu({
  open,
  onClose,
  position,
}: {
  open: boolean;
  onClose: () => void;
  position: QuickAddMenuPosition;
}) {
  useEscapeClose(onClose, open);
  const { openTodoModal, openIssueModal, openRockModal } = useQuickAdd();
  const { data: session } = useSession();
  const router = useRouter();

  if (!open) return null;

  const go = (href: string) => () => {
    router.push(href);
    onClose();
  };

  // 2026-10-07: Educators don't own rocks or raise EOS issues — their
  // "quick add" is the things they actually do: upload a certificate,
  // ask for leave, claim an expense, jot a to-do.
  const quickItems =
    session?.user?.role === "staff"
      ? [
          { label: "New To-Do", icon: CheckSquare, action: () => { openTodoModal(); onClose(); } },
          { label: "Upload a document", icon: Upload, action: go("/compliance") },
          { label: "Apply for leave", icon: Plane, action: go("/my-leave") },
          { label: "Claim an expense", icon: Receipt, action: go("/my-expenses") },
        ]
      : [
          { label: "New To-Do", icon: CheckSquare, action: () => { openTodoModal(); onClose(); } },
          { label: "New Issue", icon: AlertCircle, action: () => { openIssueModal(); onClose(); } },
          { label: "New Rock", icon: Mountain, action: () => { openRockModal(); onClose(); } },
        ];

  return (
    <>
      {/* Invisible fullscreen backdrop for outside clicks */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Menu dropdown — fixed positioned, outside any stacking context */}
      <div
        role="menu"
        aria-label="Quick add options"
        className="fixed w-48 bg-card border border-border rounded-xl shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
        style={{ top: position.top, right: position.right }}
      >
        {quickItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={item.action}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:bg-surface transition-colors"
            >
              <Icon className="w-4 h-4 text-muted" />
              {item.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
