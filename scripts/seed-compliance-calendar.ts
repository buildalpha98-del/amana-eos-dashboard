/**
 * Seed script: NQS Compliance Audit Calendar — 38 templates
 *
 * Run:  npm run db:seed-compliance
 *
 * Idempotent — uses upsert by unique name.
 * Seeds template metadata only. Checklist items are populated via the parser tool.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Freq = "monthly" | "half_yearly" | "yearly";
type Fmt = "yes_no" | "rating_1_5" | "compliant" | "reverse_yes_no" | "review_date" | "inventory";

interface TemplateDef {
  name: string;
  qualityArea: number;
  nqsReference: string;
  frequency: Freq;
  scheduledMonths: number[];
  responseFormat: Fmt;
  sortOrder: number;
}

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const templates: TemplateDef[] = [
  // ── MONTHLY ──
  { name: "Assessment and Planning Cycle Audit", qualityArea: 1, nqsReference: "1.3.1", frequency: "monthly", scheduledMonths: ALL_MONTHS, responseFormat: "yes_no", sortOrder: 1 },
  { name: "Family Newsletter Review", qualityArea: 6, nqsReference: "6.1.1", frequency: "monthly", scheduledMonths: ALL_MONTHS, responseFormat: "review_date", sortOrder: 2 },
  { name: "Monthly Team Meeting", qualityArea: 4, nqsReference: "4.2.1", frequency: "monthly", scheduledMonths: ALL_MONTHS, responseFormat: "yes_no", sortOrder: 3 },
  { name: "Quality Improvement Plan Review", qualityArea: 7, nqsReference: "7.1.2, 7.2.1", frequency: "monthly", scheduledMonths: ALL_MONTHS, responseFormat: "yes_no", sortOrder: 4 },
  { name: "Monthly Policy Review", qualityArea: 7, nqsReference: "7.1.2", frequency: "monthly", scheduledMonths: ALL_MONTHS, responseFormat: "review_date", sortOrder: 5 },

  // ── HALF-YEARLY ──
  { name: "Bathroom Safety Audit", qualityArea: 2, nqsReference: "2.1.3, 2.2.1", frequency: "half_yearly", scheduledMonths: [3, 9], responseFormat: "yes_no", sortOrder: 6 },
  { name: "Behaviour Guidance Audit", qualityArea: 5, nqsReference: "5.2.2", frequency: "half_yearly", scheduledMonths: [4, 10], responseFormat: "yes_no", sortOrder: 7 },
  { name: "Building Relationships with Families Audit", qualityArea: 6, nqsReference: "6.1.2", frequency: "half_yearly", scheduledMonths: [4, 10], responseFormat: "yes_no", sortOrder: 8 },
  { name: "Clean, Maintenance and Risk Cycle Audit", qualityArea: 2, nqsReference: "2.1.2, 2.1.3, 2.2.1, 2.2.2, 3.1.1, 3.1.2", frequency: "half_yearly", scheduledMonths: [2, 8], responseFormat: "rating_1_5", sortOrder: 9 },
  { name: "Communication Audit", qualityArea: 4, nqsReference: "4.2.1", frequency: "half_yearly", scheduledMonths: [5, 11], responseFormat: "yes_no", sortOrder: 10 },
  { name: "Effective Hygiene Audit", qualityArea: 2, nqsReference: "2.1.2", frequency: "half_yearly", scheduledMonths: [3, 9], responseFormat: "yes_no", sortOrder: 11 },
  { name: "Emergency Management Audit", qualityArea: 2, nqsReference: "2.2.2", frequency: "half_yearly", scheduledMonths: [5, 11], responseFormat: "yes_no", sortOrder: 12 },
  { name: "Equipment and Resource Audit", qualityArea: 3, nqsReference: "3.2.2", frequency: "half_yearly", scheduledMonths: [4, 10], responseFormat: "inventory", sortOrder: 13 },
  { name: "Inclusive Audit", qualityArea: 1, nqsReference: "1.1.2", frequency: "half_yearly", scheduledMonths: [4, 10], responseFormat: "yes_no", sortOrder: 14 },
  { name: "Interaction Audit", qualityArea: 5, nqsReference: "5.1.1", frequency: "half_yearly", scheduledMonths: [3, 9], responseFormat: "yes_no", sortOrder: 15 },
  { name: "Kitchen and Nutritional Practices Audit", qualityArea: 2, nqsReference: "2.1.2, 2.1.3", frequency: "half_yearly", scheduledMonths: [4, 10], responseFormat: "yes_no", sortOrder: 16 },
  { name: "Management Programming Audit", qualityArea: 1, nqsReference: "1.3.2", frequency: "half_yearly", scheduledMonths: [4, 10], responseFormat: "yes_no", sortOrder: 17 },
  { name: "Medication Audit", qualityArea: 2, nqsReference: "2.1.2, 2.2.1", frequency: "half_yearly", scheduledMonths: [6, 12], responseFormat: "yes_no", sortOrder: 18 },
  { name: "Outdoor Environment and Playground Safety Audit", qualityArea: 2, nqsReference: "3.1.2", frequency: "half_yearly", scheduledMonths: [5, 11], responseFormat: "yes_no", sortOrder: 19 },
  { name: "Physical Environment Audit", qualityArea: 3, nqsReference: "3.1.1, 3.1.2", frequency: "half_yearly", scheduledMonths: [3, 9], responseFormat: "yes_no", sortOrder: 20 },
  { name: "Physical Environment and Parent Journey Audit", qualityArea: 6, nqsReference: "6.1.1", frequency: "half_yearly", scheduledMonths: [6, 12], responseFormat: "yes_no", sortOrder: 21 },
  { name: "Poison Safety Audit", qualityArea: 2, nqsReference: "2.2.1", frequency: "half_yearly", scheduledMonths: [5, 11], responseFormat: "yes_no", sortOrder: 22 },
  { name: "Professional Development Audit", qualityArea: 7, nqsReference: "7.2.3", frequency: "half_yearly", scheduledMonths: [6, 12], responseFormat: "yes_no", sortOrder: 23 },
  { name: "Supervision Audit", qualityArea: 2, nqsReference: "2.2.1", frequency: "half_yearly", scheduledMonths: [4, 10], responseFormat: "yes_no", sortOrder: 24 },
  { name: "Teamwork Audit", qualityArea: 4, nqsReference: "4.1.2, 4.2.1", frequency: "half_yearly", scheduledMonths: [2, 8], responseFormat: "yes_no", sortOrder: 25 },

  // ── YEARLY ──
  { name: "Child Safe Standards Checklist", qualityArea: 2, nqsReference: "2.2.3", frequency: "yearly", scheduledMonths: [3], responseFormat: "yes_no", sortOrder: 26 },
  { name: "Enrolment Resources Audit", qualityArea: 7, nqsReference: "7.1.2", frequency: "yearly", scheduledMonths: [1], responseFormat: "review_date", sortOrder: 27 },
  { name: "HR Management Review Audit", qualityArea: 4, nqsReference: "4.1.1", frequency: "yearly", scheduledMonths: [7], responseFormat: "yes_no", sortOrder: 28 },
  { name: "Medical Conditions Review", qualityArea: 2, nqsReference: "2.1.2, 2.2.1", frequency: "yearly", scheduledMonths: [2], responseFormat: "review_date", sortOrder: 29 },
  { name: "Philosophy Review", qualityArea: 7, nqsReference: "7.1.1", frequency: "yearly", scheduledMonths: [2], responseFormat: "yes_no", sortOrder: 30 },
  { name: "Privacy Audit", qualityArea: 7, nqsReference: "7.1.2", frequency: "yearly", scheduledMonths: [8], responseFormat: "yes_no", sortOrder: 31 },
  { name: "Record Keeping Audit", qualityArea: 7, nqsReference: "7.1.2", frequency: "yearly", scheduledMonths: [12], responseFormat: "yes_no", sortOrder: 32 },
  { name: "Risk Assessment Review", qualityArea: 2, nqsReference: "2.2.1, 2.2.2", frequency: "yearly", scheduledMonths: [6], responseFormat: "yes_no", sortOrder: 33 },
  { name: "Special Days and Events Calendar Review", qualityArea: 1, nqsReference: "1.3.3", frequency: "yearly", scheduledMonths: [11], responseFormat: "review_date", sortOrder: 34 },
  { name: "Staff Performance Review", qualityArea: 7, nqsReference: "7.2.3", frequency: "yearly", scheduledMonths: [10], responseFormat: "yes_no", sortOrder: 35 },
  { name: "Sustainability Audit", qualityArea: 3, nqsReference: "3.2.3", frequency: "yearly", scheduledMonths: [5], responseFormat: "compliant", sortOrder: 36 },
  { name: "Sustainability Commitment Review", qualityArea: 3, nqsReference: "3.2.3", frequency: "yearly", scheduledMonths: [6], responseFormat: "compliant", sortOrder: 37 },
  { name: "Work Health and Safety Audit", qualityArea: 2, nqsReference: "2.2.1", frequency: "yearly", scheduledMonths: [2], responseFormat: "compliant", sortOrder: 38 },
];

async function main() {
  console.log("Seeding 38 NQS Compliance Audit Templates...\n");

  let created = 0;
  let updated = 0;

  for (const t of templates) {
    const result = await prisma.auditTemplate.upsert({
      where: { name: t.name },
      create: {
        name: t.name,
        qualityArea: t.qualityArea,
        nqsReference: t.nqsReference,
        frequency: t.frequency,
        scheduledMonths: t.scheduledMonths,
        responseFormat: t.responseFormat,
        sortOrder: t.sortOrder,
      },
      update: {
        qualityArea: t.qualityArea,
        nqsReference: t.nqsReference,
        frequency: t.frequency,
        scheduledMonths: t.scheduledMonths,
        responseFormat: t.responseFormat,
        sortOrder: t.sortOrder,
      },
    });

    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      created++;
    } else {
      updated++;
    }
  }

  console.log(`Done! Created: ${created}, Updated: ${updated}, Total: ${templates.length}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
