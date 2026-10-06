"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { isPublicParentRoute } from "@/lib/parent-routes";
import {
  PARENT_PORTAL_LOCKED,
  isAllowedWhileLocked,
} from "@/lib/parent-portal-lockdown";

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
  LifeBuoy,
  Settings,
  MapPin,
  FileSignature,
  LogOut,
  UserPlus,
  Construction,
  Mail,
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
  // 2026-08-04: the page existed and read real per-centre content, but
  // nothing in the app linked to it — every director who filled in their
  // centre's welcome text had been writing into a void.
  { href: "/parent/my-centre", label: "My Centre", icon: MapPin },
  { href: "/parent/bookings", label: "Bookings", icon: Calendar },
  { href: "/parent/messages", label: "Messages", icon: MessageCircle },
  { href: "/parent/billing", label: "Billing", icon: DollarSign },
  { href: "/parent/account", label: "Account", icon: Settings },
] as const;

/**
 * The four tabs that stay on the bar, and the centre action button.
 *
 * Seven tabs across a phone gave each one about 53px — under the 44px
 * target once you allow for the icon, and a row of tiny words nobody
 * reads. OWNA solves this with a "+" in the middle; same idea here, but
 * the button is the Amana mark rather than a plus, because it opens a
 * menu of things to do rather than only creating something.
 *
 * Home and Children are the two people open most; Messages carries the
 * unread badge; Account is where you go to leave. Everything else lives
 * behind the button.
 */
const TAB_ITEMS = [
  { href: "/parent", label: "Home", icon: Home },
  { href: "/parent/children", label: "Children", icon: Users },
  // 2026-08-05, per Daniel: My Centre earns the bar spot and Messages
  // moves behind the action button. The unread badge moves WITH it —
  // onto the button and the sheet row — or unread messages would go
  // silently invisible.
  { href: "/parent/my-centre", label: "My Centre", icon: MapPin },
  { href: "/parent/account", label: "Account", icon: Settings },
] as const;

/** What the centre button opens. */
const ACTION_ITEMS = [
  {
    href: "/parent/bookings",
    label: "Bookings",
    hint: "Your calendar, and casual sessions",
    icon: Calendar,
  },
  {
    href: "/parent/messages",
    label: "Messages",
    hint: "Message head office directly",
    icon: MessageCircle,
  },
  {
    href: "/parent/forms",
    label: "Forms",
    hint: "Consents and sign-offs from your centre",
    icon: FileSignature,
  },
  {
    href: "/parent/billing",
    label: "Billing",
    hint: "Statements and payment details",
    icon: DollarSign,
  },
  // 2026-09-25: previously the only inbound link was a widget on Home
  // that return-nulled once a family had zero sibling applications — a
  // family enrolling their first sibling could never reach the page, or
  // the "Enrol a Sibling" flow it links to.
  {
    href: "/parent/enrolments",
    label: "Enrolments",
    hint: "Track sibling enrolment applications",
    icon: UserPlus,
  },
  // 2026-08-08: public help centre — FAQ + submit-a-ticket. Lives outside
  // the portal (no auth) so it's a plain link, not a portal route.
  {
    href: "/support",
    label: "Help Centre",
    hint: "FAQs, and how to reach our team",
    icon: LifeBuoy,
  },
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
  const [actionsOpen, setActionsOpen] = useState(false);
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

  // ── TEMPORARY LOCKDOWN ──────────────────────────────────────
  // The parent portal is not in use for bookings or billing yet — parents
  // use OWNA. Only enrolment, messages, My Centre and Account stay open
  // (src/lib/parent-portal-lockdown.ts); everything else shows the notice.
  const allowedWhileLocked =
    !PARENT_PORTAL_LOCKED || isAllowedWhileLocked(pathname);

  if (!allowedWhileLocked) {
    return (
      <div data-v2="parent" className="parent-portal min-h-screen bg-parent-bg">
        <header
          className="bg-brand flex items-center justify-between px-4 shadow-md"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
            height: "calc(3.5rem + env(safe-area-inset-top, 0px))",
          }}
        >
          <span className="text-white font-heading font-semibold">
            Amana OSHC
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="/parent/my-centre"
              className="text-xs text-white/70 hover:text-white underline underline-offset-2"
            >
              My Centre
            </Link>
            <Link
              href="/parent/messages"
              className="text-xs text-white/70 hover:text-white underline underline-offset-2"
            >
              Messages
            </Link>
            <Link
              href="/support"
              className="text-xs text-white/70 hover:text-white underline underline-offset-2"
            >
              Help
            </Link>
            <button
              onClick={logout}
              className="text-xs text-white/70 hover:text-white underline underline-offset-2"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-lg">
            <div className="bg-card rounded-2xl shadow-2xl p-8 sm:p-10 text-center space-y-6">
              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                <Construction className="h-10 w-10 text-amber-600" />
              </div>

              <div>
                <h1 className="text-2xl font-heading font-bold text-foreground mb-2">
                  App Coming Soon!
                </h1>
                <p className="text-muted text-sm leading-relaxed">
                  Assalamu Alaikum! Thank you for being part of the Amana OSHC family.
                </p>
              </div>

              <div className="bg-red-50 dark:bg-red-950/40 border-2 border-red-300 rounded-xl p-5 text-left">
                <p className="text-base font-bold text-red-800 dark:text-red-200 mb-2">
                  Please don&apos;t book or pay through this app
                </p>
                <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed">
                  We&apos;re <strong>not using the Amana parent app</strong> for
                  bookings, fees or family details yet. Anything you book or
                  change here <strong>won&apos;t reach your centre</strong>.
                </p>
              </div>

              <div className="bg-brand/5 border border-brand/20 rounded-xl p-5 text-left">
                <p className="text-sm font-bold text-foreground mb-2">
                  Use OWNA for now
                </p>
                <p className="text-sm text-muted leading-relaxed mb-3">
                  <strong>We&apos;ll email you new OWNA login details</strong> —
                  keep an eye on your inbox (and your junk folder). OWNA is
                  where you manage:
                </p>
                <ul className="text-sm text-muted space-y-1.5 ml-4 list-disc">
                  <li><strong>All bookings</strong> — permanent and casual</li>
                  <li><strong>Invoices and fees</strong></li>
                  <li><strong>Family details</strong></li>
                </ul>
              </div>

              <Link
                href="/parent/messages"
                className="flex items-center justify-center gap-2 px-5 py-3 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-hover transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                Need help? Message us
              </Link>
              <Link
                href="/support"
                className="flex items-center justify-center gap-2 px-5 py-3 border border-brand/30 text-brand rounded-xl text-sm font-semibold hover:bg-brand/5 transition-colors"
              >
                <LifeBuoy className="h-4 w-4" />
                Browse common questions
              </Link>

              {/* A family still to enrol is redirected into the form by the
                  effect above — but only once /api/parent/state answers. If
                  that call fails (retry: false) they would sit here with no
                  way forward, so the form is always one tap away. */}
              {parentState?.state !== "pending_review" &&
                parentState?.state !== "active" && (
                  <Link
                    href={ENROL_PATH}
                    className="block bg-accent/20 border border-accent rounded-xl p-4 text-sm font-medium text-foreground hover:bg-accent/30 transition-colors"
                  >
                    New to Amana OSHC? Start or continue your enrolment →
                  </Link>
                )}

              <div className="border-t border-border pt-5">
                <p className="text-sm text-muted mb-3">
                  Questions? Contact our enrolment team:
                </p>
                <a
                  href="mailto:enrolment@amanaoshc.com.au"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-medium hover:bg-brand-hover transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  enrolment@amanaoshc.com.au
                </a>
              </div>

              <p className="text-xs text-muted">
                We look forward to launching this app for you soon, inshallah!
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Gated into the enrolment form: render it bare, with no nav. Showing
  // Children/Bookings/Billing tabs they can't use yet is just a row of
  // dead ends.
  if (mustEnrol) {
    return (
      <div data-v2="parent" className="parent-portal min-h-screen bg-parent-bg">
        <header
          className="bg-brand flex items-center px-4 shadow-md"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
            height: "calc(3.5rem + env(safe-area-inset-top, 0px))",
          }}
        >
          <span className="text-white font-heading font-semibold">
            Amana OSHC
          </span>
          {/* Families mid-enrolment are the ones most likely to get stuck,
              and had no way to help from here at all. They can't message
              us yet (no centre until they submit), so Help is the route. */}
          <Link
            href="/support"
            className="ml-auto inline-flex items-center gap-1 text-xs text-white/80 hover:text-white underline underline-offset-2 min-h-11"
          >
            <LifeBuoy className="w-3.5 h-3.5" />
            Help
          </Link>
          <button
            onClick={logout}
            className="ml-4 text-xs text-white/70 hover:text-white underline underline-offset-2"
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

  // Locked portal, on a page that stays open: a slim shell whose links are
  // ONLY the open pages. The full nav would offer Bookings/Billing tabs that
  // each lead to the "coming soon" notice — a row of dead ends.
  if (PARENT_PORTAL_LOCKED) {
    const links = [
      { href: "/parent/my-centre", label: "My Centre", icon: MapPin },
      { href: "/parent/messages", label: "Messages", icon: MessageCircle },
      { href: "/support", label: "Help", icon: LifeBuoy },
      { href: "/parent/account", label: "Account", icon: Settings },
    ];
    return (
      <div data-v2="parent" className="parent-portal min-h-screen bg-parent-bg">
        <header
          className="bg-brand flex items-center gap-1 px-3 shadow-md overflow-x-auto"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
            minHeight: "calc(3.5rem + env(safe-area-inset-top, 0px))",
          }}
        >
          <Image
            src="/logo-icon-white.svg"
            alt="Amana OSHC"
            width={18}
            height={26}
            className="mr-2 shrink-0"
            priority
          />
          {links.map((l) => {
            const active = pathname.startsWith(l.href);
            const badge = l.href === "/parent/messages" && unreadCount > 0;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap min-h-11",
                  active
                    ? "bg-white/15 text-accent"
                    : "text-white/75 hover:text-white hover:bg-white/10",
                )}
              >
                <l.icon className="w-4 h-4 shrink-0" />
                <span>{l.label}</span>
                {badge && (
                  <span className="absolute top-0.5 right-0 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-2xs font-bold">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
          <button
            onClick={logout}
            className="ml-auto pl-2 text-xs text-white/70 hover:text-white underline underline-offset-2 whitespace-nowrap min-h-11"
          >
            Sign out
          </button>
        </header>

        {/* Said on every open page, not just the notice: a parent who lands
            on My Centre from an email has never seen the notice. */}
        <div className="bg-accent/25 border-b border-accent/60 px-4 py-2.5 text-center text-xs sm:text-sm text-foreground">
          <strong>Please don&apos;t book or pay in this app.</strong> Bookings
          and fees are in OWNA — we&apos;ll email you new OWNA login details.
        </div>

        <main className="max-w-2xl mx-auto px-4 py-6 pb-12">{children}</main>
      </div>
    );
  }

  return (
    <div data-v2="parent" className="parent-portal min-h-screen bg-parent-bg">
      {/* ─── Header ─────────────────────────────────────────── */}
      {/* The bar itself stays 56px; the inset is padding ABOVE it, so the
          status bar sits on brand colour rather than over the logo. */}
      <header
        className="fixed top-0 inset-x-0 bg-brand z-30 flex items-center justify-between px-4 shadow-md"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          height: "calc(3.5rem + env(safe-area-inset-top, 0px))",
        }}
      >
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
      <main
        className="pb-20 sm:pb-8"
        style={{ paddingTop: "calc(3.5rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="max-w-2xl mx-auto px-4 py-6">{children}</div>
      </main>

      {/* ─── Bottom Tab Bar (mobile only) ───────────────────── */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 h-16 bg-brand border-t border-white/10 z-30 flex items-stretch"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {TAB_ITEMS.map((item, i) => {
          const isActive =
            item.href === "/parent"
              ? pathname === "/parent"
              : pathname.startsWith(item.href);
          // Messages lives behind the action button now, so no tab
          // carries its badge — the button and the sheet row do.
          const showBadge = false as boolean;
          return (
            <Fragment key={item.href}>
              {/* The action button sits dead centre, between the second
                  and third tab, so it's under the thumb rather than at
                  an edge. */}
              {i === 2 && (
                <button
                  type="button"
                  onClick={() => setActionsOpen(true)}
                  aria-label="More"
                  aria-haspopup="dialog"
                  className="relative flex-1 flex items-center justify-center min-h-[44px]"
                >
                  <span className="absolute -top-4 w-14 h-14 rounded-full bg-accent shadow-lg flex items-center justify-center ring-4 ring-brand">
                    {/* Messages is in the sheet this opens, so its unread
                        count surfaces here — otherwise a waiting reply is
                        invisible until someone happens to open the menu. */}
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-2xs font-bold ring-2 ring-brand">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                    {/* Midnight Green mark on the Jonquil circle — the
                        brand-approved pairing. The old brightness-0
                        filter faked BLACK, which is in nobody's palette. */}
                    <Image
                      src="/logo-icon-green.svg"
                      alt=""
                      width={22}
                      height={30}
                    />
                  </span>
                </button>
              )}
              <Link
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
            </Fragment>
          );
        })}
      </nav>

      {/* What the centre button opens. A sheet rather than more tabs:
          these are places you go occasionally, and putting them on the
          bar made every tab too narrow to hit. */}
      {actionsOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40"
          role="dialog"
          aria-modal="true"
          aria-label="More"
        >
          <button
            aria-label="Close"
            onClick={() => setActionsOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div
            className="absolute inset-x-0 bottom-0 bg-card rounded-t-2xl p-4 pb-8 space-y-1"
            style={{
              paddingBottom: "max(2rem, env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="flex justify-center pb-3">
              <span className="w-10 h-1 rounded-full bg-border" />
            </div>
            {ACTION_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setActionsOpen(false)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface min-h-11"
              >
                <span className="w-10 h-10 rounded-full bg-[color:var(--color-brand-soft)] flex items-center justify-center shrink-0">
                  <item.icon className="w-5 h-5 text-brand" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">
                    {item.label}
                  </span>
                  <span className="block text-xs text-muted">{item.hint}</span>
                </span>
                {item.href === "/parent/messages" && unreadCount > 0 && (
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-2xs font-bold shrink-0">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
