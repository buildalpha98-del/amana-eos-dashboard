"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, MapPin } from "lucide-react";

interface ServiceLite {
  id: string;
  name: string;
  suburb: string | null;
  state: string | null;
}

const PARENT_DRIVERS: Array<{ value: string; label: string }> = [
  { value: "homework", label: "Help with homework" },
  { value: "quran", label: "Quran / faith programme" },
  { value: "enrichment", label: "Enrichment activities" },
  { value: "working_parent", label: "Working-parent care" },
  { value: "traffic", label: "School-pickup traffic" },
  { value: "sports", label: "Sports / physical activity" },
];

export default function EnquireForm() {
  const sp = useSearchParams();
  const serviceIdFromUrl = sp.get("serviceId") ?? "";
  const utmSource = sp.get("utm_source");
  const utmMedium = sp.get("utm_medium");
  const utmCampaign = sp.get("utm_campaign");

  const [service, setService] = useState<ServiceLite | null>(null);
  const [serviceMissing, setServiceMissing] = useState(false);
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [parentDriver, setParentDriver] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceIdFromUrl) {
      setServiceMissing(true);
      return;
    }
    fetch(`/api/public/services/${serviceIdFromUrl}`)
      .then(async (res) => {
        if (!res.ok) {
          setServiceMissing(true);
          return;
        }
        const data = (await res.json()) as ServiceLite;
        setService(data);
      })
      .catch(() => setServiceMissing(true));
  }, [serviceIdFromUrl]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!parentName.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!parentEmail.trim() && !parentPhone.trim()) {
      setError("Please give us an email or a phone number");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: serviceIdFromUrl,
          parentName: parentName.trim(),
          parentEmail: parentEmail.trim() || undefined,
          parentPhone: parentPhone.trim() || undefined,
          childName: childName.trim() || undefined,
          childAge: childAge ? Number(childAge) : undefined,
          parentDriver: parentDriver || undefined,
          message: message.trim() || undefined,
          website: website || undefined,
          utmSource: utmSource || undefined,
          utmMedium: utmMedium || undefined,
          utmCampaign: utmCampaign || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || "Couldn't send your enquiry. Please try again.");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="w-full max-w-md rounded-2xl border-2 border-[#e8e4df] bg-white p-8 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6 text-green-700" />
        </div>
        <h1 className="text-lg font-heading font-semibold text-[#1a1a2e] mb-2">Thanks for reaching out!</h1>
        <p className="text-sm text-[#7c7c8a]">
          We&apos;ve received your enquiry{service ? ` for ${service.name}` : ""}. The team will be in touch within
          one business day.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border-2 border-[#e8e4df] bg-white p-6 sm:p-8 shadow-sm">
      <div className="mb-5">
        <h1 className="text-xl font-heading font-semibold text-[#1a1a2e]">Enquire about Amana OSHC</h1>
        {service && (
          <p className="mt-1 text-sm text-[#7c7c8a] flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" aria-hidden />
            {service.name}
            {service.suburb && <span> · {service.suburb}</span>}
            {service.state && <span className="text-[10px]">{service.state}</span>}
          </p>
        )}
        {serviceMissing && (
          <p className="mt-1 text-sm text-amber-700">
            Centre not specified — your enquiry will reach our central team and be routed to the right centre.
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Your name *">
          <input
            type="text"
            required
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            autoComplete="name"
            placeholder="e.g. Sara Khan"
            className="form-input"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Email">
            <input
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              className="form-input"
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={parentPhone}
              onChange={(e) => setParentPhone(e.target.value)}
              autoComplete="tel"
              placeholder="0400 000 000"
              className="form-input"
            />
          </Field>
        </div>
        <p className="text-xs text-[#7c7c8a] -mt-2">Provide at least one — email or phone — so we can reply.</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Field label="Child's name">
              <input
                type="text"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder="e.g. Aisha"
                className="form-input"
              />
            </Field>
          </div>
          <Field label="Age">
            <input
              type="number"
              min={3}
              max={18}
              value={childAge}
              onChange={(e) => setChildAge(e.target.value)}
              placeholder="6"
              className="form-input"
            />
          </Field>
        </div>

        <Field label="What are you looking for?">
          <select
            value={parentDriver}
            onChange={(e) => setParentDriver(e.target.value)}
            className="form-input"
          >
            <option value="">— Choose if it helps —</option>
            {PARENT_DRIVERS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Anything else (optional)">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Days you need care, specific questions, etc."
            className="form-input"
          />
        </Field>

        {/* Honeypot — hidden from real users */}
        <div className="hidden" aria-hidden="true">
          <label>Website
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full px-4 py-3 rounded-xl bg-[#004E64] text-white font-semibold hover:bg-[#0A7E9E] disabled:opacity-60 transition-colors"
        >
          {submitting ? "Sending…" : "Send enquiry"}
        </button>

        <p className="text-[11px] text-[#7c7c8a] text-center">
          By submitting you agree to be contacted about Amana OSHC enrolments.
        </p>
      </form>

      <style jsx>{`
        :global(.form-input) {
          width: 100%;
          padding: 0.625rem 0.875rem;
          border: 2px solid #e8e4df;
          border-radius: 0.625rem;
          background: rgba(250, 248, 245, 0.5);
          font-size: 0.875rem;
          color: #1a1a2e;
          outline: none;
          transition: border-color 120ms;
        }
        :global(.form-input:focus) {
          border-color: #004e64;
        }
        :global(.form-input::placeholder) {
          color: rgba(124, 124, 138, 0.7);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-[#1a1a2e]/80 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
