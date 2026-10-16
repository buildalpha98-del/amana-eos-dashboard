"use client";

/**
 * Public job-application form. Posts to /api/public/careers/[id]/apply.
 * Reads the resume file client-side into base64 and sends it inline —
 * no separate upload round-trip, one atomic submit.
 *
 * 2026-10-16: asks the few questions that decide fit (state, qualification,
 * WWCC, work rights, experience, availability) so applicants are ranked
 * automatically (src/lib/recruitment/fit.ts). For Victorian ads it shows the
 * diploma-level list, so people who already qualify know they do.
 */
import { useState } from "react";
import { describeInlineOversizeError } from "@/lib/upload-strategy";
import { VIC_DIPLOMA_LEVEL_GROUPS } from "@/lib/recruitment/vic-qualifications";

interface Props {
  vacancyId: string;
  roleLabel: string;
  centre: string;
  /**
   * Which ad sent this person here, resolved server-side from `?src=`.
   * Sent with the application so the pool can tell an Indeed applicant from
   * someone who found the careers page on their own.
   */
  source: string;
  /** "NSW" | "VIC" — preselects the state and decides whether to show the VIC list. */
  vacancyState: string | null;
  qualificationRequired: string | null;
  /** Holiday Quest ad → ask how many holiday weeks, not weekdays. */
  holiday: boolean;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:<mime>;base64," prefix.
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

const QUALIFICATIONS = [
  { value: "", label: "None yet" },
  { value: "cert_iii", label: "Certificate III or IV" },
  { value: "diploma", label: "Diploma" },
  { value: "bachelor", label: "Bachelor degree" },
  { value: "masters", label: "Masters or higher" },
  { value: "other", label: "Something else" },
];

const DAYS = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
] as const;

export function CareerApplyForm({ vacancyId, roleLabel, centre, source, vacancyState, qualificationRequired, holiday }: Props) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    suburb: "",
    postcode: "",
    state: vacancyState === "NSW" || vacancyState === "VIC" ? vacancyState : "",
    qualification: "",
    qualificationName: "",
    studying: false,
    vicDiplomaLevel: "" as "" | "yes" | "no" | "unsure",
    wwccNumber: "",
    rightToWork: "",
    hasFirstAid: false,
    yearsExperience: "",
    previousRole: "",
    holidayWeeks: "",
    days: [] as string[],
    hasTransport: false,
    message: "",
    company: "", // honeypot
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [resume, setResume] = useState<File | null>(null);
  const [showList, setShowList] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const askVic = form.state === "VIC";
  const diplomaAd = vacancyState === "VIC" && qualificationRequired === "diploma";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    try {
      let resumeFields = {};
      if (resume) {
        // The real ceiling is the serverless body cap, not the app's general
        // 10 MB file limit: this resume travels inline as base64, which
        // inflates it by a third.
        const oversize = describeInlineOversizeError(resume.size);
        if (oversize) throw new Error(oversize);
        const base64 = await readAsBase64(resume);
        resumeFields = { resumeFile: base64, resumeFilename: resume.name, resumeContentType: resume.type || undefined };
      }

      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        suburb: form.suburb || null,
        postcode: form.postcode || null,
        state: form.state || null,
        qualification: form.qualification || null,
        qualificationName: form.qualificationName || null,
        studying: form.studying,
        vicDiplomaLevel: !askVic || form.vicDiplomaLevel === "" || form.vicDiplomaLevel === "unsure" ? null : form.vicDiplomaLevel === "yes",
        wwccNumber: form.wwccNumber || null,
        rightToWork: form.rightToWork || null,
        hasFirstAid: form.hasFirstAid,
        yearsExperience: form.yearsExperience === "" ? null : Number(form.yearsExperience),
        previousRole: form.previousRole || null,
        holidayWeeks: holiday && form.holidayWeeks !== "" ? Number(form.holidayWeeks) : null,
        availableSessions: holiday ? ["vacation_care"] : [],
        availableDays: holiday ? [] : form.days,
        hasTransport: form.hasTransport,
        message: form.message || null,
        company: form.company,
        source,
        ...resumeFields,
      };

      const res = await fetch(`/api/public/careers/${vacancyId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // A 413 from the platform edge is an HTML page, not our JSON error shape.
        if (res.status === 413) throw new Error("Your resume is too large to send. Please attach a smaller file and try again.");
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong. Please try again.");
      }
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className="rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-black/5">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#004E64" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h2 className="text-2xl font-semibold text-brand">Application received</h2>
        <p className="mt-2 text-brand/75">
          Thanks, {form.name.split(" ")[0] || "there"} — your application for <strong>{roleLabel}</strong> at{" "}
          <strong>{centre}</strong> is in. We read every application and will be in touch within a few days.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-brand/20 px-4 py-3 text-brand outline-none focus:border-brand focus:ring-2 focus:ring-accent";
  const label = "mb-1 block text-sm font-medium text-brand/80";
  const section = "space-y-4 border-t border-brand/10 pt-5";
  const h3 = "text-base font-semibold text-brand";
  const check = "h-5 w-5 shrink-0 accent-[var(--color-brand)]";

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-card p-6 shadow-sm ring-1 ring-black/5 md:p-8">
      <div>
        <h2 className="text-xl font-semibold text-brand">Apply for this role</h2>
        <p className="mt-1 text-sm text-brand/60">About 3 minutes. A resume helps but isn&rsquo;t required.</p>
      </div>

      {/* About you */}
      <div className="space-y-4">
        <div>
          <label htmlFor="ap-name" className={label}>Full name *</label>
          <input id="ap-name" required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} autoComplete="name" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ap-email" className={label}>Email *</label>
            <input id="ap-email" required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} autoComplete="email" />
          </div>
          <div>
            <label htmlFor="ap-phone" className={label}>Mobile *</label>
            <input id="ap-phone" required type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} autoComplete="tel" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="ap-suburb" className={label}>Suburb</label>
            <input id="ap-suburb" value={form.suburb} onChange={(e) => set("suburb", e.target.value)} className={inputClass} autoComplete="address-level2" />
          </div>
          <div>
            <label htmlFor="ap-postcode" className={label}>Postcode</label>
            <input id="ap-postcode" inputMode="numeric" value={form.postcode} onChange={(e) => set("postcode", e.target.value)} className={inputClass} autoComplete="postal-code" />
          </div>
          <div>
            <label htmlFor="ap-state" className={label}>State you want to work in *</label>
            <select id="ap-state" required value={form.state} onChange={(e) => set("state", e.target.value)} className={inputClass}>
              <option value="">Choose…</option>
              <option value="NSW">New South Wales</option>
              <option value="VIC">Victoria</option>
            </select>
          </div>
        </div>
      </div>

      {/* Qualifications */}
      <div className={section}>
        <h3 className={h3}>Qualifications</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ap-qual" className={label}>Highest qualification</label>
            <select id="ap-qual" value={form.qualification} onChange={(e) => set("qualification", e.target.value)} className={inputClass}>
              {QUALIFICATIONS.map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ap-qualname" className={label}>Its full name <span className="font-normal text-brand/50">(if any)</span></label>
            <input id="ap-qualname" value={form.qualificationName} onChange={(e) => set("qualificationName", e.target.value)} className={inputClass} placeholder="e.g. Bachelor of Education (Primary)" />
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm text-brand">
          <input type="checkbox" className={check} checked={form.studying} onChange={(e) => set("studying", e.target.checked)} />
          I&rsquo;m currently studying towards a qualification
        </label>

        {askVic && (
          <div className="rounded-xl bg-accent-light/50 p-4">
            <p className="text-sm font-semibold text-brand">
              {diplomaAd ? "This role needs a diploma-level qualification (Victoria)." : "Working in Victoria?"} Lots of qualifications count — not only early-childhood diplomas.
            </p>
            <button type="button" onClick={() => setShowList((s) => !s)} className="mt-1 text-sm font-semibold text-brand underline">
              {showList ? "Hide the list" : "See what counts as diploma level"}
            </button>
            {showList && (
              <div className="mt-3 space-y-3 text-sm text-brand/80">
                {VIC_DIPLOMA_LEVEL_GROUPS.map((g) => (
                  <div key={g.title}>
                    <p className="font-semibold text-brand">{g.title}</p>
                    <ul className="ml-5 list-disc">
                      {g.items.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p>Enrolled and actively studying one of these? That counts too.</p>
              </div>
            )}
            <fieldset className="mt-3">
              <legend className="text-sm font-medium text-brand/80">Do you hold (or are you studying) one of these?</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {([["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]] as const).map(([v, l]) => (
                  <label key={v} className={`cursor-pointer rounded-full border px-4 py-2 text-sm ${form.vicDiplomaLevel === v ? "border-brand bg-brand text-white" : "border-brand/25 text-brand"}`}>
                    <input type="radio" name="vicDiploma" value={v} className="sr-only" checked={form.vicDiplomaLevel === v} onChange={() => set("vicDiplomaLevel", v)} />
                    {l}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
      </div>

      {/* Checks */}
      <div className={section}>
        <h3 className={h3}>Checks</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ap-wwcc" className={label}>Working With Children Check number <span className="font-normal text-brand/50">(if you have one)</span></label>
            <input id="ap-wwcc" value={form.wwccNumber} onChange={(e) => set("wwccNumber", e.target.value)} className={inputClass} placeholder="We can help you apply if not" />
          </div>
          <div>
            <label htmlFor="ap-rtw" className={label}>Right to work in Australia *</label>
            <select id="ap-rtw" required value={form.rightToWork} onChange={(e) => set("rightToWork", e.target.value)} className={inputClass}>
              <option value="">Choose…</option>
              <option value="citizen">Australian citizen</option>
              <option value="permanent_resident">Permanent resident</option>
              <option value="visa">Visa with work rights</option>
              <option value="no_rights">No work rights</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm text-brand">
          <input type="checkbox" className={check} checked={form.hasFirstAid} onChange={(e) => set("hasFirstAid", e.target.checked)} />
          I have a current first aid certificate
        </label>
      </div>

      {/* Experience & availability */}
      <div className={section}>
        <h3 className={h3}>Experience and availability</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ap-exp" className={label}>Experience working with children</label>
            <select id="ap-exp" value={form.yearsExperience} onChange={(e) => set("yearsExperience", e.target.value)} className={inputClass}>
              <option value="">Choose…</option>
              <option value="0">Less than a year</option>
              <option value="1">About 1 year</option>
              <option value="2">2 years</option>
              <option value="3">3–5 years</option>
              <option value="6">More than 5 years</option>
            </select>
          </div>
          <div>
            <label htmlFor="ap-role" className={label}>Most recent role</label>
            <input id="ap-role" value={form.previousRole} onChange={(e) => set("previousRole", e.target.value)} className={inputClass} placeholder="e.g. Casual educator, sports coach" />
          </div>
        </div>
        {holiday ? (
          <div>
            <label htmlFor="ap-weeks" className={label}>How many weeks of the summer holidays can you work? *</label>
            <select id="ap-weeks" required value={form.holidayWeeks} onChange={(e) => set("holidayWeeks", e.target.value)} className={inputClass}>
              <option value="">Choose…</option>
              <option value="1">1 week</option>
              <option value="2">2 weeks</option>
              <option value="3">3 weeks</option>
              <option value="4">4 weeks</option>
              <option value="5">5 or more weeks</option>
            </select>
          </div>
        ) : (
          <fieldset>
            <legend className={label}>Days you can usually work</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(([v, l]) => {
                const on = form.days.includes(v);
                return (
                  <label key={v} className={`cursor-pointer rounded-full border px-4 py-2 text-sm ${on ? "border-brand bg-brand text-white" : "border-brand/25 text-brand"}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => set("days", on ? form.days.filter((d) => d !== v) : [...form.days, v])} />
                    {l}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        <label className="flex items-center gap-3 text-sm text-brand">
          <input type="checkbox" className={check} checked={form.hasTransport} onChange={(e) => set("hasTransport", e.target.checked)} />
          I have my own transport
        </label>
      </div>

      {/* About you, in your words */}
      <div className={section}>
        <div>
          <label htmlFor="ap-msg" className={label}>Why you&rsquo;d be a great fit <span className="font-normal text-brand/50">(optional)</span></label>
          <textarea id="ap-msg" rows={4} value={form.message} onChange={(e) => set("message", e.target.value)} className={inputClass} placeholder="Tell us a little about yourself…" />
        </div>
        <div>
          <label htmlFor="ap-resume" className={label}>Resume <span className="font-normal text-brand/50">(PDF or Word .docx, up to 2.5MB, optional)</span></label>
          <input
            id="ap-resume"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setResume(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-brand file:mr-4 file:rounded-full file:border-0 file:bg-accent-light file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand hover:file:bg-accent"
          />
        </div>
      </div>

      {/* Honeypot — visually hidden, ignored by real users, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Company<input tabIndex={-1} autoComplete="off" value={form.company} onChange={(e) => set("company", e.target.value)} /></label>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-full bg-brand px-6 py-3.5 text-lg font-semibold text-parent-bg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {status === "submitting" ? "Sending…" : "Submit application"}
      </button>
    </form>
  );
}
