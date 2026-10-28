"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { BookOpen, ChevronRight, FileCheck2, ShieldCheck } from "lucide-react";

/** Working alternatives while external AI processing is blocked. */
export function AssistantPausedPanel() {
  const { data: session } = useSession();
  const isEducator = session?.user?.role === "staff";
  const links = [
    { href: isEducator ? "/tools/handbook" : "/handbook?tab=help", title: isEducator ? "Staff handbook" : "Help & how-to guides", description: "Find guidance for your day at Amana.", icon: BookOpen },
    { href: "/policies", title: "Policies & procedures", description: "Read the current policies and complete acknowledgements.", icon: FileCheck2 },
  ];

  return (
    <section className="mx-auto max-w-2xl space-y-6" aria-labelledby="ai-privacy-title">
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <ShieldCheck className="mb-3 h-7 w-7 text-brand" aria-hidden="true" />
        <h1 id="ai-privacy-title" className="text-xl font-heading font-semibold text-foreground">AI assistance is paused</h1>
        <p className="mt-2 text-sm text-muted">To protect children, families and staff, this dashboard blocks external AI processing. AI chat and automatic meeting transcription are unavailable.</p>
        <p className="mt-2 text-sm text-foreground">You can still use the guides below and complete your usual tasks in the dashboard.</p>
      </div>
      <div className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">Find the help you need</h2>
        {links.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card p-4 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <Icon className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block font-medium text-foreground">{title}</span><span className="mt-1 block text-sm text-muted">{description}</span></span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          </Link>
        ))}
        <p className="text-sm text-muted">Still unsure? Ask your coordinator or state manager. To report a problem, use Help → Send feedback in the top bar.</p>
      </div>
    </section>
  );
}
