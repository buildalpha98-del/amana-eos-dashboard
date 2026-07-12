import { Role } from "@prisma/client";
import { cn } from "@/lib/utils";

// Labels are kept in sync with src/lib/org-settings-shared.ts
// ROLE_LABEL_DEFAULTS. 2026-06-02: staff → "OSHC Educator",
// member → "OSHC Coordinator".
const ROLE_STYLES: Record<Role, { label: string; className: string }> = {
  owner: { label: "Owner", className: "bg-brand-dark text-white" },
  head_office: { label: "State Manager", className: "bg-brand text-white" },
  admin: { label: "Admin", className: "bg-blue-600 text-white" },
  marketing: { label: "Marketing", className: "bg-purple-500 text-white" },
  member: { label: "OSHC Coordinator", className: "bg-emerald-500 text-white" },
  staff: { label: "OSHC Educator", className: "bg-muted text-white" },
  eos_viewer: { label: "EOS Viewer", className: "bg-amber-500 text-white" },
  eos_implementer: { label: "EOS Implementer", className: "bg-amber-600 text-white" },
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const style = ROLE_STYLES[role];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
