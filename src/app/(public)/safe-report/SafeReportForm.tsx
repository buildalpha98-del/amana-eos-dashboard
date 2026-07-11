"use client";

/**
 * Anonymous safe-report submission form.
 *
 * Tone & content matter as much as the code. People filing under
 * positive-duty are often nervous about retaliation. The page should
 * read like a trusted document, not a generic web form. Concrete
 * reassurances up front, no marketing chrome, no nav.
 */

import { useState } from "react";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ExternalLink,
} from "lucide-react";

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

interface SafeReportFormProps {
  services: ServiceOption[];
}

const CATEGORIES: Array<{ key: string; label: string; hint: string }> = [
  {
    key: "harassment",
    label: "Harassment",
    hint: "Sexual harassment or any harassment based on sex, gender, race, religion, etc.",
  },
  {
    key: "discrimination",
    label: "Discrimination",
    hint: "Being treated unfairly because of a protected characteristic.",
  },
  {
    key: "bullying",
    label: "Bullying",
    hint: "Repeated unreasonable behaviour creating a risk to health and safety.",
  },
  {
    key: "child_safety",
    label: "Child safety concern",
    hint: "Something about a child's safety, including suspected harm. Mandatory reporting law may also apply — please contact authorities directly for urgent concerns.",
  },
  {
    key: "safety",
    label: "Workplace safety / hazard",
    hint: "Something at the centre that could hurt staff, children, or visitors.",
  },
  {
    key: "conduct",
    label: "Conduct concern",
    hint: "Something about how someone is behaving at work, that doesn't fit the above categories.",
  },
  {
    key: "retaliation",
    label: "Retaliation",
    hint: "You or someone else has been retaliated against for raising a concern. Treated as urgent.",
  },
  { key: "other", label: "Other", hint: "Anything not covered above." },
];

export function SafeReportForm({ services }: SafeReportFormProps) {
  const [category, setCategory] = useState<string>("");
  const [serviceId, setServiceId] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    | { kind: "ok"; id: string; receivedAt: string }
    | { kind: "err"; message: string }
    | null
  >(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/safe-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // CRITICAL: no Authorization header, no credentials. We don't
        // want any session cookie attached to this request — even
        // if the user is logged in, the cookie would be sent
        // automatically with default `credentials: 'same-origin'`.
        // Explicitly opt out.
        credentials: "omit",
        body: JSON.stringify({
          category,
          content,
          serviceId: serviceId || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Submission failed (${res.status})`);
      }
      const json = await res.json();
      setResult({ kind: "ok", id: json.id, receivedAt: json.receivedAt });
    } catch (err) {
      setResult({
        kind: "err",
        message: err instanceof Error ? err.message : "Something went wrong",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!category && content.trim().length >= 20 && !submitting;

  if (result?.kind === "ok") {
    return (
      <div className="min-h-screen bg-background py-12 px-4">
        <div className="max-w-2xl mx-auto bg-card rounded-xl border border-border p-8">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mb-4" />
          <h1 className="text-2xl font-semibold text-foreground">
            Report received
          </h1>
          <p className="mt-2 text-sm text-foreground/80">
            Thank you for raising this. Your report has been delivered to the
            director. It is anonymous — no record of your name, email, IP
            address, or device exists on our side.
          </p>
          <div className="mt-6 p-4 rounded-lg bg-surface border border-border">
            <p className="text-xs text-muted">Reference id</p>
            <p className="font-mono text-sm text-foreground mt-1">
              {result.id}
            </p>
            <p className="text-xs text-muted mt-3">
              Save this id if you'd like to reference it later (for example, if
              you choose to identify yourself in a follow-up conversation). The
              director cannot match it back to you without your help.
            </p>
          </div>
          <p className="mt-6 text-xs text-muted">
            For immediate concerns about a child's safety, please also contact
            authorities directly: NSW Child Protection Helpline 132 111.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <div className="flex items-center gap-2 text-brand">
            <Shield className="w-6 h-6" />
            <span className="text-sm font-semibold uppercase tracking-wide">
              Amana OSHC · Safe Reporting
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            Report a concern anonymously
          </h1>
        </header>

        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          <section className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-4 text-sm text-emerald-900 dark:text-emerald-200">
            <p className="font-semibold mb-1">
              This form is genuinely anonymous
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>We don&apos;t record your name, email, or login state.</li>
              <li>We don&apos;t record your IP address or device.</li>
              <li>The director sees only what you type below.</li>
              <li>
                Retaliation against anyone for raising concerns is a separate,
                serious matter you can also report here.
              </li>
            </ul>
          </section>

          <div>
            <label
              htmlFor="category"
              className="block text-sm font-medium text-foreground mb-1"
            >
              What is this about?
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={submitting}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="">Pick the closest category…</option>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            {category && (
              <p className="mt-1.5 text-xs text-muted">
                {CATEGORIES.find((c) => c.key === category)?.hint}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="service"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Which centre does this relate to?{" "}
              <span className="text-muted font-normal">(optional)</span>
            </label>
            <select
              id="service"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              disabled={submitting}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="">No specific centre / prefer not to say</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="content"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Tell us what happened
            </label>
            <textarea
              id="content"
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={submitting}
              placeholder={
                "What happened? Who was involved? When (approximate is fine)? Where? Has it happened before?\n\nWrite as much or as little as you're comfortable with. Specific dates and direct quotes are helpful but not required."
              }
              maxLength={20_000}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-mono"
            />
            <p className="mt-1 text-xs text-muted">
              {content.length} characters
              {content.length < 20 &&
                " — at least 20 characters needed before submission"}
            </p>
          </div>

          {result?.kind === "err" && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 p-3 text-sm text-red-800 dark:text-red-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>{result.message}</div>
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
            Submit anonymously
          </button>

          <div className="pt-3 border-t border-border text-xs text-muted">
            <p>
              For urgent concerns about a child&apos;s immediate safety, also
              call the relevant state authority. For NSW: Child Protection
              Helpline <strong>132 111</strong> (24h). For Victoria: Child
              Protection Crisis Line <strong>13 12 78</strong> (24h).
            </p>
            <p className="mt-2">
              For workplace harassment, you can also contact the Australian
              Human Rights Commission directly:{" "}
              <a
                href="https://humanrights.gov.au/complaints"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline inline-flex items-center gap-0.5"
              >
                humanrights.gov.au/complaints
                <ExternalLink className="w-3 h-3" />
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
