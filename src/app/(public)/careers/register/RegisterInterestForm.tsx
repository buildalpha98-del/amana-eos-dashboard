"use client";

/**
 * Public expression-of-interest form for the casual pool.
 *
 * Only name, email and mobile are required — every extra question is a reason
 * for a casual to abandon the form, and the rest can be filled in by whoever
 * screens them. The fields that ARE here are the ones that decide whether we
 * can offer a shift at all: where they live, when they can work, and whether
 * they hold a WWCC.
 */

import { useState } from "react";
import {
  POOL_SESSIONS,
  POOL_SESSION_LABELS,
  POOL_DAYS,
  POOL_DAY_LABELS,
  RIGHT_TO_WORK,
  RIGHT_TO_WORK_LABELS,
} from "@/lib/recruitment/pool";
import { describeInlineOversizeError } from "@/lib/upload-strategy";

const QUALIFICATIONS = [
  { value: "", label: "No qualification yet" },
  { value: "cert_iii", label: "Certificate III" },
  { value: "diploma", label: "Diploma" },
  { value: "bachelor", label: "Bachelor degree" },
  { value: "masters", label: "Masters" },
  { value: "other", label: "Something else" },
];


function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      // Strip the `data:<mime>;base64,` prefix — the API wants raw base64.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
}

interface Props {
  /**
   * Which ad sent this person here, resolved server-side from `?src=`.
   * Posted with the registration so a casual who came off an Indeed ad is
   * attributed to it instead of reading as organic website traffic.
   */
  source: string;
}

export function RegisterInterestForm({ source }: Props) {
  const [f, setF] = useState({
    name: "",
    email: "",
    phone: "",
    suburb: "",
    postcode: "",
    preferredRegion: "",
    qualification: "",
    studying: false,
    rightToWork: "",
    wwccNumber: "",
    hasFirstAid: false,
    previousRole: "",
    previousEmployer: "",
    hasTransport: false,
    message: "",
    company: "", // honeypot
  });
  const [sessions, setSessions] = useState<string[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [resume, setResume] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
      active
        ? "bg-brand text-white border-brand"
        : "bg-card text-foreground border-border hover:bg-surface"
    }`;

  const input =
    "mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("sending");
    try {
      let resumeFields = {};
      if (resume) {
        // The real ceiling is the serverless body cap, not a round 10MB:
        // this résumé travels inline as base64, which inflates it by a third,
        // so anything larger is rejected at the edge before the route runs and
        // the registration is lost with no server log. Same fix as the
        // per-vacancy apply form.
        const oversize = describeInlineOversizeError(resume.size);
        if (oversize) throw new Error(oversize);
        resumeFields = {
          resumeFile: await fileToBase64(resume),
          resumeFilename: resume.name,
          resumeContentType: resume.type,
        };
      }
      const res = await fetch("/api/public/careers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          source,
          qualification: f.qualification || null,
          rightToWork: f.rightToWork || null,
          availableSessions: sessions,
          availableDays: days,
          ...resumeFields,
        }),
      });
      if (!res.ok) {
        // A 413 from the platform edge is an HTML page, not our JSON error
        // shape — say something useful instead of a generic failure.
        if (res.status === 413) {
          throw new Error(
            "Your résumé is too large to send. Please attach a smaller file and try again.",
          );
        }
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Something went wrong. Please try again.");
      }
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <h2 className="text-lg font-heading font-semibold text-foreground">
          Thanks — you&apos;re on our list
        </h2>
        <p className="text-sm text-muted mt-2">
          We&apos;ll be in touch when casual shifts come up near you. If a
          centre needs cover sooner, you may hear from us quickly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-6 space-y-5">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-foreground/80">Full name *</span>
          <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground/80">Email *</span>
          <input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={input} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground/80">Mobile *</span>
          <input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={input} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground/80">Suburb</span>
          <input value={f.suburb} onChange={(e) => setF({ ...f, suburb: e.target.value })} className={input} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground/80">Postcode</span>
          <input value={f.postcode} onChange={(e) => setF({ ...f, postcode: e.target.value })} className={input} />
        </label>
      </div>

      <div>
        <span className="text-sm font-medium text-foreground/80">
          Which sessions could you work?
        </span>
        <div className="flex flex-wrap gap-2 mt-2">
          {POOL_SESSIONS.map((s) => (
            <button key={s} type="button" onClick={() => toggle(sessions, setSessions, s)} className={chip(sessions.includes(s))}>
              {POOL_SESSION_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-sm font-medium text-foreground/80">Which days?</span>
        <div className="flex flex-wrap gap-2 mt-2">
          {POOL_DAYS.map((d) => (
            <button key={d} type="button" onClick={() => toggle(days, setDays, d)} className={chip(days.includes(d))}>
              {POOL_DAY_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium text-foreground/80">Qualification</span>
          <select value={f.qualification} onChange={(e) => setF({ ...f, qualification: e.target.value })} className={input}>
            {QUALIFICATIONS.map((q) => (
              <option key={q.value} value={q.value}>{q.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground/80">Work rights</span>
          <select value={f.rightToWork} onChange={(e) => setF({ ...f, rightToWork: e.target.value })} className={input}>
            <option value="">Prefer not to say</option>
            {RIGHT_TO_WORK.filter((r) => r !== "unknown").map((r) => (
              <option key={r} value={r}>{RIGHT_TO_WORK_LABELS[r]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground/80">
            Working with Children Check number
          </span>
          <input value={f.wwccNumber} onChange={(e) => setF({ ...f, wwccNumber: e.target.value })} placeholder="If you have one" className={input} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground/80">Most recent job</span>
          <input value={f.previousRole} onChange={(e) => setF({ ...f, previousRole: e.target.value })} placeholder="e.g. Casual educator" className={input} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-foreground/80">Where was that?</span>
          <input value={f.previousEmployer} onChange={(e) => setF({ ...f, previousEmployer: e.target.value })} className={input} />
        </label>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={f.studying} onChange={(e) => setF({ ...f, studying: e.target.checked })} />
          I&apos;m currently studying
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={f.hasFirstAid} onChange={(e) => setF({ ...f, hasFirstAid: e.target.checked })} />
          I hold a current first aid certificate
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={f.hasTransport} onChange={(e) => setF({ ...f, hasTransport: e.target.checked })} />
          I have my own transport
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-foreground/80">Résumé (PDF or Word, up to 2.5MB)</span>
        <input
          type="file"
          accept=".pdf,.docx"
          onChange={(e) => setResume(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:text-white"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-foreground/80">
          Anything else you&apos;d like us to know?
        </span>
        <textarea rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} className={input} />
      </label>

      {/* Honeypot — hidden from people, irresistible to bots. */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={f.company}
        onChange={(e) => setF({ ...f, company: e.target.value })}
        className="hidden"
      />

      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Register my interest"}
      </button>
    </form>
  );
}
