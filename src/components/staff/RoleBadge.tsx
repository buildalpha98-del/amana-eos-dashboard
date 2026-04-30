import { Role } from "@prisma/client";
import { cn } from "@/lib/utils";

const ROLE_STYLES: Record<Role, { label: string; className: string }> = {
  owner: { label: "Owner", className: "bg-slate-900 text-white" },
  head_office: { label: "Head Office", className: "bg-slate-700 text-white" },
  admin: { label: "Admin", className: "bg-blue-600 text-white" },
  marketing: { label: "Marketing", className: "bg-purple-500 text-white" },
  coordinator: { label: "Coordinator", className: "bg-green-600 text-white" },
  member: { label: "Member", className: "bg-emerald-500 text-white" },
  staff: { label: "Staff", className: "bg-neutral-500 text-white" },
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
