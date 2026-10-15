/**
 * /start-check/thanks — where a family lands after tapping an answer in the
 * "Is anything stopping you?" email (GET /api/public/start-check). Public.
 */
import { CheckCircle2 } from "lucide-react";

const NEXT: Record<string, string> = {
  not_booked: "No problem — someone from your centre will be in touch to help you pick days and book them in OWNA.",
  owna_trouble: "Sorry about that! Someone from your centre will call you to get you into OWNA.",
  next_term: "Lovely — we'll look forward to seeing you next term. We'll check your start date is in OWNA.",
  changed_plans: "Thanks for letting us know. Someone from your centre will be in touch, and your place is there if things change.",
  other: "Thanks — someone from your centre will give you a call.",
};

export default async function StartCheckThanks({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const message = r && NEXT[r];
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-12 w-12 text-brand" aria-hidden />
        <h1 className="mt-4 text-xl font-heading font-semibold tracking-tight text-foreground">
          {message ? "Thank you — we've got your answer" : "This link has expired"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {message ?? "Please call your centre or email enrolments@amanaoshc.com.au and we'll help straight away."}
        </p>
        <p className="mt-6 text-sm font-semibold text-brand">Amana OSHC · Beyond The Bell</p>
      </div>
    </main>
  );
}
