"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

const inputClass =
  "w-full rounded-xl border border-black/10 bg-card px-4 py-3 text-base text-brand outline-none placeholder:text-brand/40 focus:border-brand focus:ring-2 focus:ring-brand/20";

export function TicketForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      mutateApi<{ ok: boolean; ticketNumber?: number }>("/api/public/help-centre/tickets", {
        method: "POST",
        body: { name, email, phone: phone || null, subject, message, website },
      }),
    onSuccess: (data) => {
      setTicketNumber(data.ticketNumber ?? 0);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  if (ticketNumber !== null) {
    return (
      <div className="rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-black/5">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" aria-hidden />
        <h2 className="mt-4 text-2xl font-semibold text-brand">Thanks — we&rsquo;ve got it!</h2>
        <p className="mt-2 text-brand/70">
          {ticketNumber > 0 ? (
            <>
              Your ticket <span className="font-semibold text-brand">#{ticketNumber}</span> has
              been logged.{" "}
            </>
          ) : null}
          Our team will reply to <span className="font-medium text-brand">{email}</span> as soon
          as possible.
        </p>
        <Link
          href="/support"
          className="mt-6 inline-block rounded-full bg-brand px-5 py-2.5 font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Back to the Help Centre
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-5 rounded-2xl bg-card p-6 shadow-sm ring-1 ring-black/5 sm:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-brand">Your name *</span>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            autoComplete="name"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-brand">Email *</span>
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={320}
            autoComplete="email"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-brand">
          Phone <span className="font-normal text-brand/50">(optional)</span>
        </span>
        <input
          className={inputClass}
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={40}
          autoComplete="tel"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-brand">Subject *</span>
        <input
          className={inputClass}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          maxLength={200}
          placeholder="e.g. Changing my child's booked days"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-brand">How can we help? *</span>
        <textarea
          className={`${inputClass} min-h-36 resize-y`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          maxLength={5000}
          placeholder="Include your child's name and centre if your question is about an existing enrolment."
        />
      </label>

      {/* Honeypot — hidden from real users, bots fill it and get silently dropped. */}
      <input
        type="text"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <button
        type="submit"
        disabled={submit.isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60 sm:w-auto"
      >
        {submit.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Send className="h-4 w-4" aria-hidden />
        )}
        {submit.isPending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
