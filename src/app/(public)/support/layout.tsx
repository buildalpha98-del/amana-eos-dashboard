import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";

export const metadata: Metadata = {
  title: {
    default: "Help Centre — Amana OSHC",
    template: "%s — Amana OSHC Help Centre",
  },
  description:
    "Answers to common questions about Amana OSHC enrolments, bookings, payments, CCS and our programs — or get in touch with our team.",
};

/**
 * Shared shell for the public parent help centre at /support.
 * No auth — this is a public surface linked from the parent portal
 * and the marketing site.
 */
export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-parent-bg">
      <header className="bg-brand">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/support" className="flex items-center gap-3">
            <Image
              src="/logo-full-white.svg"
              alt="Amana OSHC"
              width={132}
              height={36}
              priority
            />
            <span className="hidden border-l border-white/30 pl-3 text-sm font-medium text-white/90 sm:inline">
              Help Centre
            </span>
          </Link>
          <Link
            href="/support/tickets/new"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-accent-light"
          >
            <LifeBuoy className="h-4 w-4" aria-hidden />
            Submit a ticket
          </Link>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-black/5 bg-card/60">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-brand/70 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Amana OSHC · Before &amp; after school care</p>
          <p>
            Can&rsquo;t find what you need?{" "}
            <Link href="/support/tickets/new" className="font-medium underline">
              Contact our team
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
