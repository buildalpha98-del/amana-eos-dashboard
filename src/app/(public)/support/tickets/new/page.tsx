import Link from "next/link";
import type { Metadata } from "next";
import { TicketForm } from "./TicketForm";

export const metadata: Metadata = {
  title: "Submit a ticket",
  description:
    "Contact the Amana OSHC team — describe your question and we'll get back to you as soon as we can.",
};

export default function NewTicketPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <nav className="text-sm text-brand/60" aria-label="Breadcrumb">
        <Link href="/support" className="hover:underline">
          Help Centre
        </Link>{" "}
        / <span className="text-brand/80">Submit a ticket</span>
      </nav>
      <h1 className="mt-4 text-3xl font-semibold text-brand">Submit a ticket</h1>
      <p className="mt-2 text-brand/70">
        Tell us how we can help. Our team reads every message and will reply to the email
        address you leave here — usually within one business day.
      </p>
      <div className="mt-8">
        <TicketForm />
      </div>
    </main>
  );
}
