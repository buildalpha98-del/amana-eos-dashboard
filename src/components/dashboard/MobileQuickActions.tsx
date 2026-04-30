"use client";

import Link from "next/link";
import {
  Plane,
  ShieldCheck,
  GraduationCap,
  MessageSquare,
  CalendarDays,
  ClipboardCheck,
  Mountain,
  CheckSquare,
  UserPlus,
  BarChart3,
  Users,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickAction {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}

const educatorActions: QuickAction[] = [
  { href: "/leave", label: "Request Leave", icon: Plane, color: "text-blue-600", bgColor: "bg-blue-50" },
  { href: "/compliance", label: "My Certificates", icon: ShieldCheck, color: "text-emerald-600", bgColor: "bg-emerald-50" },
  { href: "/my-portal", label: "My Training", icon: GraduationCap, color: "text-purple-600", bgColor: "bg-purple-50" },
  { href: "/todos", label: "My To-Dos", icon: CheckSquare, color: "text-amber-600", bgColor: "bg-amber-50" },
];

const directorActions: QuickAction[] = [
  { href: "/rocks", label: "My Rocks", icon: Mountain, color: "text-brand", bgColor: "bg-brand/10" },
  { href: "/todos", label: "To-Dos", icon: CheckSquare, color: "text-amber-600", bgColor: "bg-amber-50" },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck, color: "text-emerald-600", bgColor: "bg-emerald-50" },
  { href: "/enquiries", label: "Enquiries", icon: UserPlus, color: "text-blue-600", bgColor: "bg-blue-50" },
];

const coordinatorActions: QuickAction[] = [
  { href: "/compliance", label: "Compliance", icon: ShieldCheck, color: "text-emerald-600", bgColor: "bg-emerald-50" },
  { href: "/leave", label: "Leave Requests", icon: CalendarDays, color: "text-blue-600", bgColor: "bg-blue-50" },
  { href: "/timesheets", label: "Timesheets", icon: ClipboardCheck, color: "text-purple-600", bgColor: "bg-purple-50" },
  { href: "/todos", label: "To-Dos", icon: CheckSquare, color: "text-amber-600", bgColor: "bg-amber-50" },
];

const leaderActions: QuickAction[] = [
  { href: "/scorecard", label: "Scorecard", icon: BarChart3, color: "text-brand", bgColor: "bg-brand/10" },
  { href: "/rocks", label: "Rocks", icon: Mountain, color: "text-emerald-600", bgColor: "bg-emerald-50" },
  { href: "/team", label: "Team", icon: Users, color: "text-purple-600", bgColor: "bg-purple-50" },
  { href: "/todos", label: "To-Dos", icon: CheckSquare, color: "text-amber-600", bgColor: "bg-amber-50" },
];

const marketingActions: QuickAction[] = [
  { href: "/marketing", label: "Campaigns", icon: Megaphone, color: "text-pink-600", bgColor: "bg-pink-50" },
  { href: "/crm", label: "CRM", icon: UserPlus, color: "text-blue-600", bgColor: "bg-blue-50" },
  { href: "/enquiries", label: "Enquiries", icon: MessageSquare, color: "text-emerald-600", bgColor: "bg-emerald-50" },
  { href: "/communication", label: "Comms", icon: MessageSquare, color: "text-amber-600", bgColor: "bg-amber-50" },
];

function getActionsForRole(role: string): QuickAction[] {
  switch (role) {
    case "staff":
      return educatorActions;
    case "member":
      return directorActions;
    case "member":
      return coordinatorActions;
    case "marketing":
      return marketingActions;
    case "owner":
    case "head_office":
    case "admin":
      return leaderActions;
    default:
      return educatorActions;
  }
}

interface MobileQuickActionsProps {
  role: string;
}

export function MobileQuickActions({ role }: MobileQuickActionsProps) {
  const actions = getActionsForRole(role);

  return (
    <div className="md:hidden">
      <h3 className="text-sm font-semibold text-foreground/80 mb-3">Quick Actions</h3>
      <div className="grid grid-cols-4 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border/50 transition-all active:scale-95",
                action.bgColor
              )}
            >
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center bg-card shadow-sm")}>
                <Icon className={cn("w-5 h-5", action.color)} />
              </div>
              <span className="text-[11px] font-medium text-foreground/80 text-center leading-tight">
                {action.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
