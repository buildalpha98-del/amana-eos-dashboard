"use client";

import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  MapPin,
  MessageCircle,
  Heart,
  Smartphone,
} from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import type { ParentEnrolmentState } from "@/lib/parent-enrolment-state";
import { Button } from "@/components/ui/Button";

interface WelcomeCentre {
  id: string;
  name: string;
  address: string | null;
}

/** A useful home while daily bookings and billing remain with OWNA. */
export function ParentWelcomeHome() {
  const state = useQuery<{ state: ParentEnrolmentState }>({
    queryKey: ["parent", "state"],
    queryFn: () => fetchApi("/api/parent/state"),
    staleTime: 60_000,
    retry: false,
  });
  const centres = useQuery<{ centres: WelcomeCentre[] }>({
    queryKey: ["parent", "centres"],
    queryFn: () => fetchApi("/api/parent/centres"),
    retry: 1,
  });
  const status = state.data?.state;
  const helpHref = centres.data?.centres.length
    ? "/parent/messages"
    : "/support";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-brand p-6 sm:p-8 text-white">
        <Image
          src="/logo-full-white.svg"
          alt="Amana OSHC"
          width={112}
          height={60}
          priority
        />
        <p className="mt-6 text-sm text-white/80">
          Assalamu alaikum. Welcome to your Amana family hub.
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-heading font-semibold leading-tight">
          A little more prepared.
          <br />A little more at home.
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/85">
          Get to know your school’s care team, find the details you need and ask
          us anything along the way.
        </p>
      </section>

      <section
        aria-labelledby="enrolment-heading"
        className="rounded-2xl border border-border bg-card p-5 sm:p-6"
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Your next step
        </p>
        <h2
          id="enrolment-heading"
          className="mt-2 font-heading text-xl font-semibold"
        >
          Your enrolment
        </h2>
        {state.isPending ? (
          <p role="status" className="mt-3 text-sm text-muted">
            Checking your enrolment…
          </p>
        ) : state.isError ? (
          <div className="mt-3 space-y-3">
            <p role="alert" className="text-sm text-muted">
              We couldn’t load your enrolment status. Your saved information
              hasn’t changed.
            </p>
            <Button variant="outline" onClick={() => void state.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="mt-3 text-sm leading-relaxed text-muted">
            {status === "active" ? (
              <>
                <p className="font-semibold text-foreground">
                  Your family has a confirmed enrolment.
                </p>
                <p className="mt-2">
                  If you have submitted another child’s enrolment, it may still
                  be under review. Our team will confirm each child’s
                  arrangements separately.
                </p>
                <p className="mt-2">
                  Before the first day, make sure your OWNA access and booked
                  sessions are confirmed with our team.
                </p>
              </>
            ) : status === "pending_review" ? (
              <>
                <p className="font-semibold text-foreground">
                  Your enrolment is with our team.
                </p>
                <p className="mt-2">
                  We’ll email you once we’ve reviewed the details and contact
                  you if anything else is needed. You can explore your school
                  information while you wait.
                </p>
              </>
            ) : (
              <>
                <p>
                  Finish your enrolment so our team can review your family’s
                  details.
                </p>
                <Link
                  href="/parent/enrol"
                  className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4"
                >
                  Continue enrolment
                </Link>
              </>
            )}
          </div>
        )}
        {(status === "active" || status === "pending_review") && (
          <Link
            href="/parent/children/new"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline underline-offset-4"
          >
            Enrol another child
          </Link>
        )}
      </section>

      <section aria-labelledby="school-heading" className="space-y-3">
        <h2 id="school-heading" className="font-heading text-xl font-semibold">
          Your school, your community
        </h2>
        {centres.isPending ? (
          <p role="status" className="text-sm text-muted">
            Finding your school information…
          </p>
        ) : centres.isError ? (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <p role="alert" className="text-sm text-muted">
              We couldn’t load your school information.
            </p>
            <Button variant="outline" onClick={() => void centres.refetch()}>
              Try again
            </Button>
          </div>
        ) : centres.data?.centres.length ? (
          <div className="space-y-3">
            {centres.data.centres.map((centre) => (
              <Link
                key={centre.id}
                href={`/parent/my-centre?centre=${encodeURIComponent(centre.id)}`}
                className="group flex gap-4 rounded-2xl border border-border bg-card p-5 hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              >
                <MapPin className="mt-1 h-6 w-6 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-heading text-lg font-semibold">
                    {centre.name}
                  </h3>
                  {centre.address && (
                    <p className="mt-1 text-sm text-muted break-words">
                      {centre.address}
                    </p>
                  )}
                  <p className="mt-3 text-sm text-brand font-semibold">
                    Meet your team & plan your first day
                  </p>
                </div>
                <ArrowUpRight
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 text-brand"
                />
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">
            Your school information will appear once your enrolment is linked to
            a centre.{" "}
            <Link
              href={helpHref}
              className="inline-flex min-h-11 items-center text-brand underline"
            >
              Ask our team for help
            </Link>
          </div>
        )}
      </section>

      <section
        className="rounded-2xl bg-accent/20 border border-accent/40 p-5 sm:p-6"
        aria-labelledby="owna-heading"
      >
        <Smartphone aria-hidden="true" className="h-6 w-6 text-brand" />
        <h2
          id="owna-heading"
          className="mt-3 text-xl font-heading font-semibold"
        >
          One place for information. OWNA for daily care.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Use this Amana hub for school information, enrolment and messages to
          our team. Use OWNA for bookings, fees and day-to-day updates.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Our team sets up your family in OWNA separately. Follow the
          instructions in your OWNA invitation; your Amana password doesn’t sign
          you into OWNA. Already using OWNA? Keep using your existing access.
        </p>
        <Link
          href={helpHref}
          className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-brand underline underline-offset-4"
        >
          <MessageCircle className="h-4 w-4" />
          Need your OWNA invitation?
        </Link>
      </section>

      <section
        aria-labelledby="first-day-heading"
        className="rounded-2xl border border-border bg-card p-5 sm:p-6"
      >
        <Heart aria-hidden="true" className="h-6 w-6 text-brand" />
        <h2
          id="first-day-heading"
          className="mt-3 font-heading text-xl font-semibold"
        >
          Let’s make their first day feel familiar
        </h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted list-disc pl-5">
          <li>
            Check your school’s meeting point and arrival and pickup details in
            My Centre.
          </li>
          <li>
            Confirm your child’s first day and booked sessions with our team.
          </li>
          <li>
            Tell us about any changes to medical needs or authorised pickup
            arrangements before they attend.
          </li>
          <li>
            You can collect your child at any time during the afternoon session,
            before your centre closes.
          </li>
        </ul>
        <Link
          href={helpHref}
          className="mt-4 inline-flex min-h-11 items-center gap-2 font-semibold text-brand underline underline-offset-4"
        >
          Something on your mind? Message us{" "}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </section>
      <Link
        href="/support"
        className="inline-flex min-h-11 items-center text-sm text-brand underline underline-offset-4"
      >
        Find answers in the Amana Help Centre
      </Link>
    </div>
  );
}
