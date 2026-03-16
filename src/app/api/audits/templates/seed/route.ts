import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * POST /api/audits/templates/seed
 * Seed NQS-aligned audit templates for OSHC services.
 * Owner-only, idempotent (skips existing templates by name).
 */

interface SeedItem {
  section?: string;
  question: string;
  guidance?: string;
  sortOrder: number;
  isRequired?: boolean;
}

interface SeedTemplate {
  name: string;
  description: string;
  qualityArea: number;
  nqsReference: string;
  frequency: "monthly" | "half_yearly" | "yearly";
  scheduledMonths: number[];
  estimatedMinutes: number;
  items: SeedItem[];
}

const SEED_TEMPLATES: SeedTemplate[] = [
  // QA1 — Educational program and practice
  {
    name: "Programming & Planning Audit",
    description:
      "Review of weekly programming, planning documentation, and alignment with MTOP outcomes for OSHC sessions.",
    qualityArea: 1,
    nqsReference: "QA1.1, QA1.2, QA1.3",
    frequency: "monthly",
    scheduledMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    estimatedMinutes: 30,
    items: [
      { section: "Program Design", question: "Is a weekly program displayed and accessible to families?", sortOrder: 1 },
      { section: "Program Design", question: "Does the program reflect children's interests, strengths, and ideas?", sortOrder: 2 },
      { section: "Program Design", question: "Are MTOP outcomes clearly linked to planned activities?", sortOrder: 3 },
      { section: "Program Design", question: "Is there evidence of intentional teaching in the program?", sortOrder: 4 },
      { section: "Observations", question: "Are individual and group observations being documented regularly?", sortOrder: 5 },
      { section: "Observations", question: "Do observations inform future planning and program adjustments?", sortOrder: 6 },
      { section: "Evaluation", question: "Are program evaluations completed each week?", sortOrder: 7 },
      { section: "Evaluation", question: "Do evaluations include children's voices and feedback?", sortOrder: 8 },
    ],
  },

  // QA2 — Children's health and safety
  {
    name: "Health & Safety Checklist",
    description:
      "Monthly health, safety, and hygiene audit covering first aid, incident procedures, sun safety, and cleaning protocols.",
    qualityArea: 2,
    nqsReference: "QA2.1, QA2.2",
    frequency: "monthly",
    scheduledMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    estimatedMinutes: 45,
    items: [
      { section: "First Aid", question: "Is the first aid kit fully stocked and within expiry dates?", sortOrder: 1 },
      { section: "First Aid", question: "Are all staff current with first aid and CPR certification?", sortOrder: 2 },
      { section: "First Aid", question: "Is the incident/injury register up to date?", sortOrder: 3 },
      { section: "Hygiene", question: "Are handwashing procedures displayed and followed?", sortOrder: 4 },
      { section: "Hygiene", question: "Are food preparation areas clean and compliant?", sortOrder: 5 },
      { section: "Sun Safety", question: "Is sunscreen available and applied before outdoor play?", sortOrder: 6 },
      { section: "Sun Safety", question: "Are shaded areas available for outdoor activities?", sortOrder: 7 },
      { section: "Environment", question: "Are indoor and outdoor areas free from hazards?", sortOrder: 8 },
      { section: "Environment", question: "Is the risk assessment register current?", sortOrder: 9 },
      { section: "Emergency", question: "Are emergency evacuation procedures displayed and practised?", sortOrder: 10 },
    ],
  },

  // QA3 — Physical environment
  {
    name: "Environment & Resources Audit",
    description:
      "Assessment of physical learning environments, equipment condition, and resource availability across indoor and outdoor spaces.",
    qualityArea: 3,
    nqsReference: "QA3.1, QA3.2",
    frequency: "half_yearly",
    scheduledMonths: [3, 9],
    estimatedMinutes: 40,
    items: [
      { section: "Indoor Spaces", question: "Are indoor spaces organised to support different types of play?", sortOrder: 1 },
      { section: "Indoor Spaces", question: "Are resources age-appropriate and in good condition?", sortOrder: 2 },
      { section: "Indoor Spaces", question: "Is furniture clean, safe, and appropriately sized?", sortOrder: 3 },
      { section: "Outdoor Spaces", question: "Do outdoor spaces offer a variety of experiences (active, quiet, creative)?", sortOrder: 4 },
      { section: "Outdoor Spaces", question: "Is outdoor equipment regularly inspected and maintained?", sortOrder: 5 },
      { section: "Sustainability", question: "Are sustainable practices embedded (recycling, garden, water saving)?", sortOrder: 6 },
      { section: "Accessibility", question: "Are spaces accessible for children with additional needs?", sortOrder: 7 },
    ],
  },

  // QA4 — Staffing arrangements
  {
    name: "Staffing & Ratios Audit",
    description:
      "Review of staff-to-child ratios, qualification compliance, roster coverage, and professional development records.",
    qualityArea: 4,
    nqsReference: "QA4.1, QA4.2",
    frequency: "monthly",
    scheduledMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    estimatedMinutes: 25,
    items: [
      { section: "Ratios", question: "Are educator-to-child ratios met at all times during sessions?", sortOrder: 1 },
      { section: "Ratios", question: "Are ratios maintained during transitions (arrival/departure)?", sortOrder: 2 },
      { section: "Qualifications", question: "Do at least 50% of educators hold or be working towards an ACECQA-approved diploma or above?", sortOrder: 3 },
      { section: "Qualifications", question: "Are all staff working with children WWCC cleared?", sortOrder: 4 },
      { section: "Professional Development", question: "Have all staff completed required annual PD hours?", sortOrder: 5 },
      { section: "Professional Development", question: "Are staff performance reviews conducted at scheduled intervals?", sortOrder: 6 },
    ],
  },

  // QA5 — Relationships with children
  {
    name: "Relationships & Interactions Audit",
    description:
      "Observation-based audit of educator-child interactions, behaviour guidance practices, and relationship quality.",
    qualityArea: 5,
    nqsReference: "QA5.1, QA5.2",
    frequency: "half_yearly",
    scheduledMonths: [5, 11],
    estimatedMinutes: 35,
    items: [
      { section: "Interactions", question: "Do educators engage in meaningful conversations with children?", sortOrder: 1 },
      { section: "Interactions", question: "Are interactions warm, respectful, and responsive?", sortOrder: 2 },
      { section: "Interactions", question: "Do educators support children's agency and decision-making?", sortOrder: 3 },
      { section: "Behaviour Guidance", question: "Is there a documented behaviour guidance policy in use?", sortOrder: 4 },
      { section: "Behaviour Guidance", question: "Are positive guidance strategies consistently applied?", sortOrder: 5 },
      { section: "Inclusion", question: "Are all children supported to participate in activities?", sortOrder: 6 },
      { section: "Inclusion", question: "Are cultural backgrounds and diversity respected and celebrated?", sortOrder: 7 },
    ],
  },

  // QA6 — Collaborative partnerships with families and communities
  {
    name: "Family & Community Partnerships Audit",
    description:
      "Review of family engagement, communication practices, community partnerships, and transition-to-school processes.",
    qualityArea: 6,
    nqsReference: "QA6.1, QA6.2",
    frequency: "half_yearly",
    scheduledMonths: [4, 10],
    estimatedMinutes: 30,
    items: [
      { section: "Family Engagement", question: "Are families welcomed and encouraged to participate in the service?", sortOrder: 1 },
      { section: "Family Engagement", question: "Is family feedback regularly sought and actioned?", sortOrder: 2 },
      { section: "Communication", question: "Are families informed about their child's experiences and development?", sortOrder: 3 },
      { section: "Communication", question: "Are multiple communication channels used (app, email, displays)?", sortOrder: 4 },
      { section: "Community", question: "Are community partnerships established and documented?", sortOrder: 5 },
      { section: "Transitions", question: "Are transition processes in place for new enrolments?", sortOrder: 6 },
    ],
  },

  // QA7 — Governance and leadership
  {
    name: "Governance & Leadership Audit",
    description:
      "Annual review of governance structures, QIP progress, policy compliance, and leadership practices.",
    qualityArea: 7,
    nqsReference: "QA7.1, QA7.2",
    frequency: "yearly",
    scheduledMonths: [12],
    estimatedMinutes: 60,
    items: [
      { section: "QIP", question: "Is the Quality Improvement Plan current and actively reviewed?", sortOrder: 1 },
      { section: "QIP", question: "Are QIP goals aligned with NQS quality areas?", sortOrder: 2 },
      { section: "QIP", question: "Is there documented progress against QIP goals?", sortOrder: 3 },
      { section: "Policies", question: "Are all required policies in place and within review dates?", sortOrder: 4 },
      { section: "Policies", question: "Are staff aware of and following current policies?", sortOrder: 5 },
      { section: "Compliance", question: "Are regulatory notifications lodged as required?", sortOrder: 6 },
      { section: "Compliance", question: "Is the service approval information displayed correctly?", sortOrder: 7 },
      { section: "Leadership", question: "Does the Responsible Person demonstrate effective leadership?", sortOrder: 8 },
      { section: "Leadership", question: "Is there a clear philosophy statement guiding practice?", sortOrder: 9 },
    ],
  },

  // Operational — Daily opening/closing
  {
    name: "Daily Opening & Closing Checklist",
    description:
      "Operational checklist for BSC/ASC session opening and closing procedures including safety checks and sign-in/out.",
    qualityArea: 2,
    nqsReference: "QA2.2, Reg168",
    frequency: "monthly",
    scheduledMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    estimatedMinutes: 15,
    items: [
      { section: "Opening", question: "Has the venue been inspected for hazards before children arrive?", sortOrder: 1 },
      { section: "Opening", question: "Is the attendance register ready and accessible?", sortOrder: 2 },
      { section: "Opening", question: "Are allergy/medical action plans displayed and accessible?", sortOrder: 3 },
      { section: "During Session", question: "Are sign-in/sign-out records being completed by families?", sortOrder: 4 },
      { section: "During Session", question: "Are headcounts conducted regularly during the session?", sortOrder: 5 },
      { section: "Closing", question: "Are all children signed out before the service closes?", sortOrder: 6 },
      { section: "Closing", question: "Has the venue been cleaned and secured?", sortOrder: 7 },
      { section: "Closing", question: "Have any incidents been documented and reported?", sortOrder: 8 },
    ],
  },

  // Vacation Care specific
  {
    name: "Vacation Care Preparation Audit",
    description:
      "Pre-vacation care period audit covering program planning, excursion risk assessments, staffing, and supplies.",
    qualityArea: 1,
    nqsReference: "QA1.1, QA2.2, Reg100-102",
    frequency: "half_yearly",
    scheduledMonths: [3, 9],
    estimatedMinutes: 45,
    items: [
      { section: "Program", question: "Is the vacation care program finalised and distributed to families?", sortOrder: 1 },
      { section: "Program", question: "Does the program include a balance of indoor, outdoor, and excursion activities?", sortOrder: 2 },
      { section: "Excursions", question: "Are risk assessments completed for all planned excursions?", sortOrder: 3 },
      { section: "Excursions", question: "Are excursion permission forms collected from families?", sortOrder: 4 },
      { section: "Excursions", question: "Are transport arrangements confirmed and compliant?", sortOrder: 5 },
      { section: "Staffing", question: "Is the roster finalised with appropriate ratios for each day?", sortOrder: 6 },
      { section: "Supplies", question: "Are all supplies and materials ordered for planned activities?", sortOrder: 7 },
      { section: "Enrolments", question: "Are all vacation care enrolments confirmed and paid?", sortOrder: 8 },
    ],
  },

  // Food Safety
  {
    name: "Food Safety & Kitchen Audit",
    description:
      "Monthly audit of food handling, storage, allergen management, and kitchen hygiene for OSHC meal/snack provision.",
    qualityArea: 2,
    nqsReference: "QA2.1, Food Act",
    frequency: "monthly",
    scheduledMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    estimatedMinutes: 20,
    items: [
      { section: "Food Handling", question: "Do all food handling staff hold current food safety certificates?", sortOrder: 1 },
      { section: "Food Handling", question: "Are handwashing and glove procedures followed during food prep?", sortOrder: 2 },
      { section: "Storage", question: "Is the fridge temperature logged daily and within safe range (0-5°C)?", sortOrder: 3 },
      { section: "Storage", question: "Are dry goods stored correctly and within use-by dates?", sortOrder: 4 },
      { section: "Allergens", question: "Are children's allergy/dietary requirements documented and accessible?", sortOrder: 5 },
      { section: "Allergens", question: "Are allergen-safe procedures followed (separate utensils, labelling)?", sortOrder: 6 },
      { section: "Hygiene", question: "Are kitchen surfaces and equipment cleaned and sanitised after each use?", sortOrder: 7 },
    ],
  },
];

export async function POST() {
  const { error } = await requireAuth();
  if (error) return error;

  let created = 0;
  let skipped = 0;

  for (const tmpl of SEED_TEMPLATES) {
    const existing = await prisma.auditTemplate.findUnique({
      where: { name: tmpl.name },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.auditTemplate.create({
      data: {
        name: tmpl.name,
        description: tmpl.description,
        qualityArea: tmpl.qualityArea,
        nqsReference: tmpl.nqsReference,
        frequency: tmpl.frequency,
        scheduledMonths: tmpl.scheduledMonths,
        estimatedMinutes: tmpl.estimatedMinutes,
        sortOrder: tmpl.qualityArea,
        items: {
          create: tmpl.items.map((item) => ({
            section: item.section || null,
            question: item.question,
            guidance: item.guidance || null,
            sortOrder: item.sortOrder,
            isRequired: item.isRequired ?? true,
          })),
        },
      },
    });
    created++;
  }

  return NextResponse.json(
    {
      message: "Audit templates seeded",
      created,
      skipped,
      total: SEED_TEMPLATES.length,
    },
    { status: 201 }
  );
}
