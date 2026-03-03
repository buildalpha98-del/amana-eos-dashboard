"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import {
  LayoutDashboard,
  Eye,
  Mountain,
  CheckSquare,
  AlertCircle,
  BarChart3,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Presentation,
  Building2,
  FolderKanban,
  DollarSign,
  Trophy,
  FileText,
  MessageSquare,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canAccessPage } from "@/lib/permissions";
import type { Role } from "@prisma/client";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "EOS" },
  { href: "/vision", label: "Vision / V-TO", icon: Eye, section: "EOS" },
  { href: "/rocks", label: "Rocks", icon: Mountain, section: "EOS" },
  { href: "/todos", label: "To-Dos", icon: CheckSquare, section: "EOS" },
  { href: "/issues", label: "Issues", icon: AlertCircle, section: "EOS" },
  { href: "/scorecard", label: "Scorecard", icon: BarChart3, section: "EOS" },
  { href: "/financials", label: "Financials", icon: DollarSign, section: "Operations" },
  { href: "/performance", label: "Performance", icon: Trophy, section: "Operations" },
  { href: "/services", label: "Services", icon: Building2, section: "Operations" },
  { href: "/projects", label: "Projects", icon: FolderKanban, section: "Operations" },
  { href: "/meetings", label: "Meetings", icon: Presentation, section: "Operations" },
  { href: "/marketing", label: "Marketing", icon: Megaphone, section: "Operations" },
  { href: "/tickets", label: "Tickets", icon: MessageSquare, section: "Support" },
  { href: "/documents", label: "Documents", icon: FileText, section: "Admin" },
  { href: "/team", label: "Team", icon: Users, section: "Admin" },
  { href: "/settings", label: "Settings", icon: Settings, section: "Admin" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-[#003344] text-white flex flex-col transition-all duration-300 z-40",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10">
        <Image
          src="/logo-icon-white.svg"
          alt="Amana OSHC"
          width={28}
          height={40}
          className="flex-shrink-0"
        />
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-semibold tracking-tight truncate">
              Amana OSHC
            </h1>
            <p className="text-[10px] text-white/50 uppercase tracking-wider">
              EOS Dashboard
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.filter((item) => canAccessPage(session?.user?.role as Role | undefined, item.href)).map((item, index, filtered) => {
          const showSectionHeader =
            index === 0 || filtered[index - 1].section !== item.section;
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <div key={item.href}>
              {showSectionHeader && (
                <>
                  {index > 0 && (
                    <div
                      className={cn(
                        "my-2",
                        collapsed ? "px-2" : "px-3"
                      )}
                    >
                      {collapsed ? (
                        <div className="h-px bg-white/10"></div>
                      ) : (
                        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider pl-1">
                          {item.section}
                        </h3>
                      )}
                    </div>
                  )}
                </>
              )}
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150",
                  isActive
                    ? "bg-white/10 text-[#FECE00]"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="border-t border-white/10 p-3">
        {session?.user && (
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#004E64] flex items-center justify-center text-xs font-medium">
              {session.user.name
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </div>
            {!collapsed && (
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">
                  {session.user.name}
                </p>
                <p className="text-[10px] text-white/50 capitalize">
                  {session.user.role}
                </p>
              </div>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-[#003344] border border-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>
    </aside>
  );
}
