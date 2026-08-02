/**
 * /privacy — Amana OSHC privacy policy.
 *
 * ⚠️ WHY THIS EXISTS AND WHAT IT IS NOT
 *
 * The enrolment form asks families to tick "I have read and accept the
 * privacy policy" with a link to amanaoshc.com.au/privacy, which returns
 * 404. Families have been agreeing to a document they cannot open, which
 * is not a valid acceptance and doesn't meet APP 1 (an APP entity must
 * have a clearly expressed, up-to-date policy and make it AVAILABLE).
 *
 * This page is written from what the system ACTUALLY collects, uses,
 * shares and retains — every claim below is traceable to a field in the
 * enrolment form or a documented handling path, not boilerplate.
 *
 * It is NOT legal advice and has not been reviewed by a lawyer. It is a
 * working document that closes a live gap; Daniel should have it reviewed
 * and, ideally, published on the main site so there is one canonical
 * copy rather than two that can drift.
 *
 * Retention periods cite Regulation 183 of the Education and Care
 * Services National Regulations, which distinguishes incident/medication
 * records (until the child turns 25) from other child records (3 years
 * after the last date of care). Do not "simplify" that to a single number
 * — they are genuinely different obligations.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Amana OSHC",
  description:
    "How Amana OSHC collects, uses, stores and shares your family's personal information.",
};

const UPDATED = "1 August 2026";
const CONTACT = "enrolments@amanaoshc.com.au";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-heading font-semibold text-foreground">
        {title}
      </h2>
      <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-parent-bg">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-wide text-brand font-semibold">
            Amana OSHC
          </p>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold text-foreground mt-1">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted mt-2">Last updated {UPDATED}</p>
        </header>

        <div className="bg-card rounded-xl border border-border p-5 sm:p-8 space-y-8">
          <p className="text-sm text-foreground/80 leading-relaxed">
            Amana OSHC provides Outside School Hours Care. To care for your
            child safely and to meet our legal obligations, we collect
            information about your family. This policy explains what we
            collect, why, who we share it with, how long we keep it, and how
            you can access or correct it.
          </p>

          <Section title="What we collect">
            <p>
              <strong>About you (the parent or carer):</strong> your name,
              date of birth, email address, mobile number, home address,
              Centrelink Customer Reference Number (CRN), cultural background
              and the language spoken at home.
            </p>
            <p>
              <strong>About your child:</strong> their name, date of birth,
              gender, school and classroom, Medicare number and expiry,
              cultural background, immunisation status, and their doctor&apos;s
              name, address and phone number.
            </p>
            <p>
              <strong>Health information about your child</strong> — including
              anaphylaxis, allergies, asthma, other medical conditions,
              medications, dietary requirements and any additional needs.
              Health information is <em>sensitive information</em> under the
              Privacy Act. We collect it only with your consent, and only so
              we can keep your child safe.
            </p>
            <p>
              <strong>Other people:</strong> the name, relationship, phone
              number and address of your emergency contacts and anyone
              authorised to collect your child, together with what each person
              is authorised to consent to.
            </p>
            <p>
              <strong>Court orders and parenting plans</strong>, including the
              name of anyone whose contact with your child is restricted. We
              need this so our educators know who may and may not collect
              your child.
            </p>
            <p>
              <strong>Payment details.</strong> Your bank or card details are
              stored encrypted. Everyday screens show only the last few digits
              — the full number is never displayed in the ordinary course of
              business.
            </p>
          </Section>

          <Section title="Why we collect it">
            <p>
              The Education and Care Services National Law and National
              Regulations require an approved provider to keep an enrolment
              record for every child, including specific health information,
              authorisations and emergency contacts. Much of what we ask is
              legally required rather than optional.
            </p>
            <p>
              We also use your information to provide and manage your
              child&apos;s care, to communicate with you, to invoice you, and
              to claim Child Care Subsidy on your behalf.
            </p>
          </Section>

          <Section title="Who we share it with">
            <p>
              <strong>Our educators and staff</strong>, to the extent they need
              it to care for your child — for example, a child&apos;s allergies
              and action plan.
            </p>
            <p>
              <strong>Services Australia</strong>, for Child Care Subsidy
              purposes.
            </p>
            <p>
              <strong>Emergency services and medical practitioners</strong>, in
              an emergency or where you have authorised us to seek treatment.
            </p>
            <p>
              <strong>Service providers</strong> who host or process our
              systems under contract — for example our email provider and
              cloud hosting. They may only use the information to provide that
              service to us.
            </p>
            <p>
              <strong>Regulatory authorities</strong>, where we are required or
              authorised by law — for example a notifiable incident, or a
              mandatory report where we believe a child is at risk.
            </p>
            <p>
              We do not sell your information, and we do not use it for
              marketing without asking you separately.
            </p>
          </Section>

          <Section title="How long we keep it">
            <p>
              Retention is set by Regulation 183 of the National Regulations,
              and different records have different periods:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                Records of an incident, injury, trauma or illness, and records
                of medication administered, are kept until your child turns 25.
              </li>
              <li>
                Other records about your child, including the enrolment
                record, are kept until three years after the last date your
                child was in our care.
              </li>
            </ul>
            <p>
              Financial records are kept for the period required by Australian
              tax law. After the applicable period we destroy or de-identify
              the information.
            </p>
          </Section>

          <Section title="How we protect it">
            <p>
              Information is held in access-controlled systems. Staff see only
              what their role requires. Payment details are encrypted, and
              access to the full details is restricted to senior staff and
              recorded in an audit log each time it is viewed.
            </p>
          </Section>

          <Section title="Accessing or correcting your information">
            <p>
              You can ask to see the information we hold about your family, or
              ask us to correct it, at any time. Email{" "}
              <a
                href={`mailto:${CONTACT}`}
                className="text-brand underline font-medium"
              >
                {CONTACT}
              </a>
              . We will respond within a reasonable period. If we decline, we
              will tell you why in writing.
            </p>
            <p>
              You can also update much of your family&apos;s information
              yourself in the Family Portal.
            </p>
          </Section>

          <Section title="If you have a concern">
            <p>
              If you think we have mishandled your information, please contact
              us first at{" "}
              <a
                href={`mailto:${CONTACT}`}
                className="text-brand underline font-medium"
              >
                {CONTACT}
              </a>{" "}
              so we can put it right.
            </p>
            <p>
              If you are not satisfied with our response, you can complain to
              the Office of the Australian Information Commissioner at{" "}
              <a
                href="https://www.oaic.gov.au"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand underline font-medium"
              >
                oaic.gov.au
              </a>
              .
            </p>
          </Section>

          <Section title="Anonymity">
            <p>
              You can deal with us anonymously when making a general enquiry.
              We cannot enrol a child anonymously — the Regulations require us
              to record who the child is and who is responsible for them.
            </p>
          </Section>
        </div>

        <p className="text-xs text-muted mt-6 text-center">
          Questions about this policy? Email{" "}
          <a href={`mailto:${CONTACT}`} className="underline">
            {CONTACT}
          </a>
        </p>
      </div>
    </main>
  );
}
