import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * POST /api/policies/seed
 *
 * Owner-only endpoint that seeds standard OSHC policies for NQS compliance.
 * Safe to call multiple times -- skips policies that already exist by title.
 *
 * Run from browser console:
 *   fetch('/api/policies/seed', { method: 'POST' }).then(r => r.json()).then(console.log)
 */

const DEFAULT_POLICIES = [
  // ── Child Safety ──────────────────────────────────────────
  {
    title: "Child Safe Environment Policy",
    description:
      "Outlines our commitment to maintaining a child-safe environment, including staff screening requirements, safe recruitment practices, and reporting obligations under the Children's Guardian Act. This policy ensures all staff understand their duty of care and the organisational culture of child safety.",
    category: "Child Safety",
  },
  {
    title: "Child Protection Policy",
    description:
      "Details mandatory reporting procedures for suspected abuse or neglect, guidance on recognising signs of harm, and documentation requirements. This policy ensures compliance with state and territory child protection legislation and supports educators in fulfilling their legal obligations.",
    category: "Child Safety",
  },
  {
    title: "Supervision Policy",
    description:
      "Defines educator-to-child ratio requirements, sight-and-sound supervision expectations, and procedures for transitions, excursions, and high-risk activities. Effective supervision is a cornerstone of the National Quality Standard and critical to preventing incidents in OSHC settings.",
    category: "Child Safety",
  },
  {
    title: "Behaviour Guidance Policy",
    description:
      "Establishes positive behaviour guidance strategies, outlines prohibited disciplinary practices, and describes procedures for documenting incidents and communicating with families. This policy aligns with the National Quality Framework's focus on respectful, inclusive interactions with children.",
    category: "Child Safety",
  },
  {
    title: "Anti-Bullying Policy",
    description:
      "Defines bullying behaviours including cyberbullying, sets out prevention strategies and response procedures for the OSHC context. This policy supports a safe and inclusive environment where all children feel respected and valued.",
    category: "Child Safety",
  },

  // ── Health & Safety ───────────────────────────────────────
  {
    title: "Incident, Illness & Trauma Policy",
    description:
      "Covers incident response procedures, first aid administration, family notification within 24 hours, and serious incident reporting to the regulatory authority. This policy ensures timely, appropriate responses that prioritise children's wellbeing and meet legislative requirements.",
    category: "Health & Safety",
  },
  {
    title: "Medical Conditions & Medication Policy",
    description:
      "Addresses management of medical conditions including anaphylaxis, asthma, and diabetes through individual medical management plans, medication administration procedures, and emergency response protocols. Ensures all staff are trained and prepared to respond to medical emergencies.",
    category: "Health & Safety",
  },
  {
    title: "Infectious Disease & Immunisation Policy",
    description:
      "Outlines exclusion periods for infectious diseases, outbreak management procedures, immunisation record requirements, and COVID-safe practices. This policy protects the health of children, families, and staff by preventing the spread of communicable diseases in the OSHC environment.",
    category: "Health & Safety",
  },
  {
    title: "Sun Safety Policy",
    description:
      "Implements SunSmart guidelines including UV index monitoring, mandatory hat and sunscreen requirements, scheduling outdoor activities to minimise UV exposure, and provision of adequate shade. Protects children and staff from harmful ultraviolet radiation during outdoor OSHC programs.",
    category: "Health & Safety",
  },
  {
    title: "Nutrition & Food Safety Policy",
    description:
      "Establishes healthy eating guidelines aligned with Australian Dietary Guidelines, allergy management procedures, food handling and storage standards, and choking prevention strategies. Ensures children receive safe, nutritious food and beverages while in OSHC care.",
    category: "Health & Safety",
  },
  {
    title: "Emergency & Evacuation Policy",
    description:
      "Details procedures for emergency situations including fire, lockdown, and medical emergencies, along with evacuation protocols, drill frequency requirements, and emergency contact management. Ensures all staff and children are prepared to respond safely and effectively to emergencies.",
    category: "Health & Safety",
  },

  // ── Governance ────────────────────────────────────────────
  {
    title: "Privacy & Confidentiality Policy",
    description:
      "Governs the collection, storage, and access to personal information in compliance with the Privacy Act 1988, including photo consent and information sharing protocols. Ensures families' and staff members' personal data is handled with the highest level of care and transparency.",
    category: "Governance",
  },
  {
    title: "Complaints & Grievances Policy",
    description:
      "Defines the complaint handling process including receipt, investigation, escalation pathways, documentation requirements, and resolution timeframes. This policy ensures families, staff, and community members have a clear, fair, and transparent avenue for raising concerns.",
    category: "Governance",
  },
  {
    title: "Code of Conduct",
    description:
      "Sets out expected standards of behaviour for staff, volunteers, families, and children within the OSHC service. This policy establishes a shared understanding of professional and ethical conduct that supports a safe, respectful, and inclusive learning environment.",
    category: "Governance",
  },
  {
    title: "Enrolment & Orientation Policy",
    description:
      "Describes the enrolment process, priority of access guidelines, orientation procedures for new families, and transition support for children. Ensures a welcoming, well-organised onboarding experience that meets regulatory requirements and sets families up for success.",
    category: "Governance",
  },

  // ── Workforce ─────────────────────────────────────────────
  {
    title: "Recruitment & Staffing Policy",
    description:
      "Outlines safer recruitment practices including Working With Children Check (WWCC) requirements, qualification verification, reference checks, and the staff induction process. Ensures all personnel working with children meet legislative requirements and are suitable for child-related work.",
    category: "Workforce",
  },
  {
    title: "Staff Professional Development Policy",
    description:
      "Details ongoing training requirements including minimum annual professional development hours, mandatory first aid and CPR renewal schedules, and support for further qualifications. Ensures educators maintain current knowledge and skills aligned with the National Quality Framework.",
    category: "Workforce",
  },
  {
    title: "Work Health & Safety Policy",
    description:
      "Covers WHS obligations for the OSHC workplace including hazard identification and reporting, risk assessment procedures, incident investigation, and return-to-work processes. Ensures a safe working environment for all staff in compliance with WHS legislation.",
    category: "Workforce",
  },

  // ── Operations ────────────────────────────────────────────
  {
    title: "Excursion & Incursion Policy",
    description:
      "Addresses planning requirements for excursions and incursions including risk assessments, parental consent, educator-to-child ratios, transport arrangements, and venue suitability checks. Ensures off-site and on-site activities are conducted safely and enrich the OSHC program.",
    category: "Operations",
  },
  {
    title: "Delivery & Collection of Children Policy",
    description:
      "Defines procedures for authorised person verification, late collection protocols, failure-to-collect responses, and management of custody and court orders. Ensures the safe handover of children and protects services from liability through clear documentation and communication.",
    category: "Operations",
  },
];

export async function POST() {
  const { error } = await requireAuth(["owner"]);
  if (error) return error;

  try {
    const created: string[] = [];
    const skipped: string[] = [];

    for (const policy of DEFAULT_POLICIES) {
      const existing = await prisma.policy.findFirst({
        where: { title: policy.title, deleted: false },
      });

      if (existing) {
        skipped.push(policy.title);
        continue;
      }

      await prisma.policy.create({
        data: {
          title: policy.title,
          description: policy.description,
          category: policy.category,
          status: "published",
          version: 1,
          requiresReack: true,
          publishedAt: new Date(),
        },
      });

      created.push(policy.title);
    }

    return NextResponse.json({
      message: `Seeded ${created.length} policies`,
      created,
      skipped,
      total: DEFAULT_POLICIES.length,
    });
  } catch (err) {
    console.error("Policy seed error:", err);
    return NextResponse.json(
      { error: "Failed to seed policies" },
      { status: 500 }
    );
  }
}
