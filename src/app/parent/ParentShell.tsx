"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { isPublicParentRoute } from "@/lib/parent-routes";

/** Where a parent without an enrolment is funnelled. */
const ENROL_PATH = "/parent/enrol";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import type { ParentEnrolmentState } from "@/lib/parent-enrolment-state";

import {
  Home,
  Users,
  Calendar,
  MessageCircle,
  DollarSign,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ParentAuthProvider,
  useParentAuth,
} from "@/components/parent/ParentAuthProvider";
import { useParentConversations } from "@/hooks/useParentPortal";
import { NotificationBell } from "@/components/parent/NotificationBell";
import { registerParentServiceWorker } from "@/lib/push/register";

const NAV_ITEMS = [
  { href: "/parent", label: "Home", icon: Home },
  { href: "/parent/children", label: "Children", icon: Users },
  { href: "/parent/bookings", label: "Bookings", icon: Calendar },
  { href: "/parent/messages", label: "Messages", icon: MessageCircle },
  { href: "/parent/billing", label: "Billing", icon: DollarSign },
  { href: "/parent/account", label: "Account", icon: Settings },
] as const;

export function ParentShell({ children }: { children: React.ReactNode }) {
  return (
    <ParentAuthProvider>
      <ParentShellInner>{children}</ParentShellInner>
    </ParentAuthProvider>
  );
}

function ParentShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading, logout } = useParentAuth();
  const router = useRouter();

  // 2026-07-30: the enrolment gate. A parent with no children on their
  // account sees ONLY the enrolment form — landing them on a home page
  // with nothing to show was both confusing and the source of the
  // "No contact record found" toast.
  //
  // Once submitted they get the full portal but still can't book, until
  // staff approve. That distinction lives in canBook(), not here.
  const { data: parentState } = useQuery<{ state: ParentEnrolmentState }>({
    queryKey: ["parent", "state"],
    queryFn: () => fetchApi("/api/parent/state"),
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: false,
  });
  const mustEnrol = parentState?.state === "needs_enrolment";
  const { data: conversations } = useParentConversations();
  const unreadCount = (conversations ?? []).reduce(
    (sum, c) => sum + (c.unreadCount ?? 0),
    0,
  );

  // Register the service worker once per authed parent session so push
  // events can be delivered even when the portal tab is closed.
  useEffect(() => {
    if (!isAuthenticated) return;
    registerParentServiceWorker().catch(() => {});
  }, [isAuthenticated]);

  // Funnel them into the form. router.replace (not push) so Back can't
  // bounce them out of it.
  useEffect(() => {
    if (!isAuthenticated || !mustEnrol) return;
    if (pathname === ENROL_PATH) return;
    router.replace(ENROL_PATH);
  }, [isAuthenticated, mustEnrol, pathname, router]);

  // Public parent routes — rendered bare, with no shell and no auth gate.
  //
  // 2026-07-30: this used to list ONLY /parent/login, so /parent/signup and
  // /parent/confirm fell through to the `!isAuthenticated` branch below and
  // rendered nothing while the auth provider bounced the visitor away. A
  // parent creating their first account is BY DEFINITION not authenticated,
  // so the sign-up and confirmation pages must never be gated — that showed
  // up as "session expired" on a page they'd never even seen.
  if (isPublicParentRoute(pathname)) {
    return <>{children}</>;
  }

  // Show nothing while auth check is pending
  if (isLoading) {
    return (
      <div className="min-h-screen bg-parent-bg flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-brand border-t-transparent rounded-full" />
      </div>
    );
  }

  // Not authenticated — auth provider will redirect, but render nothing in the meantime
  if (!isAuthenticated) {
    return null;
  }

  // Gated into the enrolment form: render it bare, with no nav. Showing
  // Children/Bookings/Billing tabs they can't use yet is just a row of
  // dead ends.
  if (mustEnrol) {
    return (
      <div data-v2="parent" className="parent-portal min-h-screen bg-parent-bg">
        <header className="h-14 bg-brand flex items-center px-4 shadow-md">
          <span className="text-white font-heading font-semibold">
            Amana OSHC
          </span>
          <button
            onClick={logout}
            className="ml-auto text-xs text-white/70 hover:text-white underline underline-offset-2"
          >
            Sign out
          </button>
        </header>
        <main className="pb-10">
          {pathname === ENROL_PATH ? (
            children
          ) : (
            // Mid-redirect. A spinner rather than a flash of the old page.
            <div className="flex items-center justify-center py-24">
              <div className="animate-spin h-8 w-8 border-4 border-brand border-t-transparent rounded-full" />
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div data-v2="parent" className="parent-portal min-h-screen bg-parent-bg">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 h-14 bg-brand z-30 flex items-center justify-between px-4 shadow-md">
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
            const showBadge =
              item.href === "/parent/messages" && unreadCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-white/15 text-accent"
                    : "text-white/70 hover:text-white hover:bg-white/10",
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
                {showBadge && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-2xs font-bold">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors"
            aria-label="Log out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>

      {/* ─── Main content ───────────────────────────────────── */}
      <main className="pt-14 pb-20 sm:pb-8">
        <div className="max-w-2xl mx-auto px-4 py-6">{children}</div>
      </main>

      {/* ─── Bottom Tab Bar (mobile only) ───────────────────── */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 h-16 bg-brand border-t border-white/10 z-30 flex items-stretch"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/parent"
              ? pathname === "/parent"
              : pathname.startsWith(item.href);
          const showBadge = item.href === "/parent/messages" && unreadCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px]",
                isActive ? "text-accent" : "text-white/60",
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-2xs font-medium">{item.label}</span>
              {showBadge && (
                <span className="absolute top-1 right-[calc(50%-2px)] translate-x-3 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-2xs font-bold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
