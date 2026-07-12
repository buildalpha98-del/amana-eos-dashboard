"use client";

/**
 * Public job-application form. Posts to /api/public/careers/[id]/apply.
 * Reads the resume file client-side into base64 and sends it inline —
 * no separate upload round-trip, one atomic submit.
 */
import { useState } from "react";

interface Props {
  vacancyId: string;
  roleLabel: string;
  centre: string;
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

export function CareerApplyForm({ vacancyId, roleLabel, centre }: Props) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
    company: "", // honeypot
  });
  const [resume, setResume] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    try {
      let resumeFields = {};
      if (resume) {
        if (resume.size > 10 * 1024 * 1024) {
          throw new Error("Your resume is larger than 10MB. Please attach a smaller file.");
        }
        const base64 = await readAsBase64(resume);
        resumeFields = {
          resumeFile: base64,
          resumeFilename: resume.name,
          resumeContentType: resume.type || undefined,
        };
      }

      const res = await fetch(`/api/public/careers/${vacancyId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...resumeFields }),
      });

      if (!res.ok) {
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
          Thanks, {form.name.split(" ")[0] || "there"} — your application for{" "}
          <strong>{roleLabel}</strong> at <strong>{centre}</strong> is in. Our team
          reviews every application and will be in touch by email.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-brand/20 px-4 py-3 text-brand outline-none focus:border-brand focus:ring-2 focus:ring-accent";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-card p-6 shadow-sm ring-1 ring-black/5 md:p-8">
      <h2 className="text-xl font-semibold text-brand">Apply for this role</h2>

      <div>
        <label className="mb-1 block text-sm font-medium text-brand/80">Full name *</label>
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} autoComplete="name" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-brand/80">Email *</label>
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} autoComplete="email" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-brand/80">Phone</label>
          <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} autoComplete="tel" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-brand/80">
          Why you&rsquo;d be a great fit <span className="font-normal text-brand/50">(optional)</span>
        </label>
        <textarea rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={inputClass} placeholder="Tell us a little about yourself and your experience…" />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-brand/80">
          Resume <span className="font-normal text-brand/50">(PDF or Word .docx, optional)</span>
        </label>
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => setResume(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-brand file:mr-4 file:rounded-full file:border-0 file:bg-[#FFF2BF] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand hover:file:bg-accent"
        />
      </div>

      {/* Honeypot — visually hidden, ignored by real users, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Company<input tabIndex={-1} autoComplete="off" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-full bg-brand px-6 py-3.5 text-lg font-semibold text-[#FFFAE6] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {status === "submitting" ? "Sending…" : "Submit application"}
      </button>
    </form>
  );
}
