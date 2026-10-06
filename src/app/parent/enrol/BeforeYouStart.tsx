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
  Building2,
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
      "Medicare card number and expiry date",
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
      "Immunisation history statement (download it from myGov → Medicare)",
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
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-6 space-y-5">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-full bg-accent/25 flex items-center justify-center mx-auto">
          <Building2 className="w-7 h-7 text-brand" />
        </div>
        <h1 className="text-2xl font-heading font-bold text-foreground">
          {resuming ? "What you'll need" : "Before you start"}
        </h1>
        <p className="text-sm text-muted max-w-md mx-auto">
          Enrolling takes about <strong>15 minutes</strong> if you have these
          handy. Your answers save as you go, so you can stop and come back any
          time.
        </p>
      </div>

      <div className="bg-card rounded-xl border border-border divide-y divide-border">
        {GROUPS.map((g) => (
          <div key={g.title} className="flex gap-3 p-4">
            <span className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
              <g.icon className="w-4 h-4 text-brand" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{g.title}</p>
              <ul className="mt-1 space-y-1 text-sm text-muted list-disc pl-4">
                {g.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted text-center">
        Missing something? Start anyway — you can come back to finish. A photo
        taken on your phone is fine for every document.
      </p>

      <Button className="w-full min-h-12" onClick={onStart}>
        {resuming ? "Back to the form" : "I'm ready — let's start"}
      </Button>
    </div>
  );
}
