"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, Users, Calendar, DollarSign, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { ParentAuthProvider, useParentAuth } from "@/components/parent/ParentAuthProvider";

const NAV_ITEMS = [
  { href: "/parent", label: "Home", icon: Home },
  { href: "/parent/children", label: "Children", icon: Users },
  { href: "/parent/bookings", label: "Bookings", icon: Calendar },
  { href: "/parent/billing", label: "Billing", icon: DollarSign },
  { href: "/parent/account", label: "Account", icon: Settings },
] as const;

export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ParentAuthProvider>
      <ParentLayoutInner>{children}</ParentLayoutInner>
    </ParentAuthProvider>
  );
}

function ParentLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading, logout } = useParentAuth();

  // On the login page, render children directly without shell
  if (pathname === "/parent/login") {
    return <>{children}</>;
  }

  // Show nothing while auth check is pending
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FFFAE6] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#004E64] border-t-transparent rounded-full" />
      </div>
    );
  }

  // Not authenticated — auth provider will redirect, but render nothing in the meantime
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#FFFAE6]">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 h-14 bg-[#004E64] z-30 flex items-center justify-between px-4 shadow-md">
        <Link href="/parent" className="flex items-center gap-2">
          <Image
            src="/logo-icon-white.svg"
            alt="Amana OSHC"
            width={20}
            height={28}
            priority
          />
          <span className="text-white font-heading font-semibold text-sm hidden sm:inline">
            Amana OSHC
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/parent"
                ? pathname === "/parent"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-white/15 text-[#FECE00]"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors"
          aria-label="Log out"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Log out</span>
        </button>
      </header>

      {/* ─── Main content ───────────────────────────────────── */}
      <main className="pt-14 pb-20 sm:pb-8">
        <div className="max-w-2xl mx-auto px-4 py-6">{children}</div>
      </main>

      {/* ─── Bottom Tab Bar (mobile only) ───────────────────── */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 h-16 bg-[#004E64] border-t border-white/10 z-30 flex items-stretch"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/parent"
              ? pathname === "/parent"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px]",
                isActive ? "text-[#FECE00]" : "text-white/60"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
