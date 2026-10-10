"use client";

/**
 * "Have these ready" — shown before a family starts a fresh enrolment, and
 * reopenable from any step via "What you'll need".
 *
 * The form asks for a dozen things families have to go and find (two CRNs,
 * a Medicare card, the doctor's address, an immunisation statement, any
 * action plan, bank details). Discovering each one mid-form is what makes
 * it feel endless; listing them up front — the way Camp Australia and
 * OSHClub do — turns it into one sitting. Kept in step with the form's
 * actual requirements in src/lib/enrol-draft.ts; if you add a required
 * field there, add it here too.
 */

import {
  Baby,
  ArrowRight,
  Clock3,
  Save,
  ClipboardList,
  CreditCard,
  FileText,
  HeartPulse,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

const GROUPS: { icon: LucideIcon; title: string; items: string[] }[] = [
  {
    icon: Users,
    title: "You and your child's other parent or carer",
    items: [
      "Names, dates of birth, mobile numbers and home address",
      "Your CRN (Centrelink Customer Reference Number) — it's in myGov or the Centrelink app",
      "Any court orders or parenting plans, if they apply",
    ],
  },
  {
    icon: Baby,
    title: "Your child",
    items: [
      "Their school and class (for example D.G1Y)",
      "Medicare card number and expiry date, if they have one",
      "Their CRN, if they have one",
    ],
  },
  {
    icon: HeartPulse,
    title: "Health",
    items: [
      "Your doctor's name, phone number and address",
      "Any allergies, conditions, medications or dietary needs",
      "A signed anaphylaxis or asthma action plan, if your child has one",
    ],
  },
  {
    icon: FileText,
    title: "Photos of two documents",
    items: [
      "Birth certificate",
      "Immunisation history statement (download it from myGov → Medicare) — you can send this later if you need to",
    ],
  },
  {
    icon: ClipboardList,
    title: "An emergency contact",
    items: [
      "Someone other than you or the other parent — their name, phone and address",
    ],
  },
  {
    icon: CreditCard,
    title: "Direct debit details",
    items: ["Account name, BSB and account number (fees are charged later, not today)"],
  },
];

export function BeforeYouStart({
  onStart,
  resuming,
}: {
  onStart: () => void;
  /** Reopened from the form, rather than shown before starting. */
  resuming?: boolean;
}) {
  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-8 sm:py-12 space-y-7">
      <div className="text-center space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] uppercase text-brand">
          A little preparation. A bright beginning.
        </p>
        <h1 className="text-4xl sm:text-5xl text-brand">
          {resuming ? "What you'll need" : "Before you start"}
        </h1>
        <p className="text-base leading-relaxed text-brand/80 max-w-xl mx-auto">
          Enrolling takes about <strong>15 minutes</strong> if you have these
          handy. Your answers save as you go, so you can stop and come back any
          time.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3 text-sm text-brand">
        <span className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2">
          <Clock3 aria-hidden="true" className="h-4 w-4" /> About 15 minutes
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2">
          <Save aria-hidden="true" className="h-4 w-4" /> Save and come back
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.title} className="flex gap-3 rounded-2xl border border-brand/10 bg-card p-5 sm:p-6">
            <span className="w-10 h-10 rounded-full bg-accent/30 flex items-center justify-center shrink-0">
              <g.icon aria-hidden="true" className="w-5 h-5 text-brand" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg leading-snug text-brand">{g.title}</h2>
              <ul className="mt-2 space-y-2 text-sm leading-relaxed text-brand/80 list-disc pl-4">
                {g.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm leading-relaxed text-brand/80 text-center max-w-xl mx-auto">
        Missing something? Start anyway — you can come back to finish. A photo
        taken on your phone is fine for every document.
      </p>

      <Button
        className="w-full min-h-12 rounded-full bg-accent text-brand-dark hover:bg-accent/85 sm:max-w-sm sm:mx-auto sm:flex"
        iconRight={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
        onClick={onStart}
      >
        {resuming ? "Back to the form" : "I'm ready — let's start"}
      </Button>
    </div>
  );
}
