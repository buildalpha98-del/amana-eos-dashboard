import type { Metadata } from "next";
import Link from "next/link";
import { RegisterInterestForm } from "./RegisterInterestForm";

/**
 * /careers/register — the casual pool's public front door.
 *
 * Deliberately separate from the per-vacancy apply pages: most people who want
 * OSHC work aren't applying to one advertised role, they want to go on the
 * books for casual shifts. This is also the link an Indeed ad points at, since
 * Indeed gives us no way to pull applicants automatically.
 */
export const metadata: Metadata = {
  title: "Join the Amana OSHC casual team",
  description:
    "Register your interest in casual educator work with Amana OSHC across our before school, after school and vacation care programmes.",
};

export const dynamic = "force-dynamic";

export default function RegisterInterestPage() {
  return (
    <main className="min-h-screen bg-surface py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/careers" className="text-sm text-brand hover:underline">
          ← All open roles
        </Link>

        <header className="mt-4 mb-6">
          <h1 className="text-2xl font-heading font-semibold tracking-tight text-foreground">
            Join our casual team
          </h1>
          <p className="text-sm text-muted mt-2">
            We run Rise and Shine Club before school, Amana Afternoons after
            school, and Holiday Quest during the school holidays. Tell us a
            little about yourself and when you can work, and we&apos;ll be in
            touch when shifts come up near you.
          </p>
          <p className="text-sm text-muted mt-2">
            You don&apos;t need a qualification to start &mdash; many of our
            educators are studying, and we&apos;ll support you through it.
          </p>
        </header>

        <RegisterInterestForm />
      </div>
    </main>
  );
}
