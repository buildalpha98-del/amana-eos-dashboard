import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
/**
 * POST /api/onboarding/seed
 *
 * Owner-only endpoint that seeds OSHC onboarding pack templates.
 * Safe to call multiple times — skips packs that already exist by name.
 *
 * Run from browser console:
 *   fetch('/api/onboarding/seed', { method: 'POST' }).then(r => r.json()).then(console.log)
 */

const ALL_PACKS = [
  {
    name: "New Educator Induction",
    description:
      "Complete onboarding checklist for new OSHC educators. Covers compliance, training, policies, and centre orientation to ensure staff are fully prepared before working with children.",
    isDefault: true,
    tasks: [
      // Compliance & Documentation
      { title: "Submit Working With Children Check (WWCC) clearance", category: "Compliance", sortOrder: 1, isRequired: true },
      { title: "Submit valid First Aid certificate (HLTAID012 or equivalent)", category: "Compliance", sortOrder: 2, isRequired: true },
      { title: "Submit valid CPR certificate (HLTAID009)", category: "Compliance", sortOrder: 3, isRequired: true },
      { title: "Submit Anaphylaxis Management certificate (HLTAID007 or 22578VIC)", category: "Compliance", sortOrder: 4, isRequired: true },
      { title: "Submit Asthma Management certificate (22556VIC or equivalent)", category: "Compliance", sortOrder: 5, isRequired: true },
      { title: "Complete Child Protection / Mandatory Reporting training", category: "Compliance", sortOrder: 6, isRequired: true },
      { title: "Provide proof of qualifications (Cert III, Diploma, or degree)", category: "Compliance", sortOrder: 7, isRequired: true },
      { title: "Submit signed employment contract and Tax File Declaration", category: "HR", sortOrder: 8, isRequired: true },
      { title: "Complete superannuation choice form", category: "HR", sortOrder: 9, isRequired: true },
      { title: "Provide bank details for payroll", category: "HR", sortOrder: 10, isRequired: true },

      // Policies & Procedures
      { title: "Read and acknowledge the Staff Handbook", category: "Policies", sortOrder: 11, isRequired: true },
      { title: "Read Child Safe Standards policy and sign acknowledgment", category: "Policies", sortOrder: 12, isRequired: true },
      { title: "Read Behaviour Guidance policy", category: "Policies", sortOrder: 13, isRequired: true },
      { title: "Read Privacy and Confidentiality policy", category: "Policies", sortOrder: 14, isRequired: true },
      { title: "Read Social Media and Photography policy", category: "Policies", sortOrder: 15, isRequired: true },
      { title: "Read Emergency Management and Evacuation procedures", category: "Policies", sortOrder: 16, isRequired: true },
      { title: "Read Food Safety and Allergy Management policy", category: "Policies", sortOrder: 17, isRequired: true },
      { title: "Read Workplace Health & Safety (WHS) policy", category: "Policies", sortOrder: 18, isRequired: true },
      { title: "Read Incident, Injury, Trauma and Illness policy", category: "Policies", sortOrder: 19, isRequired: true },
      { title: "Read Code of Conduct and sign acknowledgment", category: "Policies", sortOrder: 20, isRequired: true },

      // Training & Orientation
      { title: "Complete centre orientation walkthrough with Coordinator", category: "Orientation", sortOrder: 21, isRequired: true },
      { title: "Review My Time Our Place (MTOP) framework overview", category: "Training", sortOrder: 22, isRequired: true },
      { title: "Review National Quality Standard (NQS) overview for educators", category: "Training", sortOrder: 23, isRequired: true },
      { title: "Learn sign-in/sign-out procedures and parent collection protocols", category: "Orientation", sortOrder: 24, isRequired: true },
      { title: "Learn medication storage and administration procedures", category: "Orientation", sortOrder: 25, isRequired: true },
      { title: "Review children's medical action plans and allergy lists", category: "Orientation", sortOrder: 26, isRequired: true },
      { title: "Learn emergency evacuation routes and assembly points", category: "Orientation", sortOrder: 27, isRequired: true },
      { title: "Shadow an experienced educator for 2 full sessions", category: "Orientation", sortOrder: 28, isRequired: true },

      // IT & Systems
      { title: "Set up staff portal login and email", category: "IT Setup", sortOrder: 29, isRequired: true },
      { title: "Set up timesheet / rostering system access", category: "IT Setup", sortOrder: 30, isRequired: true },
      { title: "Download and set up communication app (if applicable)", category: "IT Setup", sortOrder: 31, isRequired: false },

      // Probation
      { title: "Complete 2-week check-in meeting with Coordinator", category: "Probation", sortOrder: 32, isRequired: true },
      { title: "Complete 6-week probation review meeting", category: "Probation", sortOrder: 33, isRequired: true },
    ],
  },
  {
    name: "Centre Coordinator Induction",
    description:
      "Extended onboarding for new Centre Coordinators. Includes all standard educator tasks plus leadership, administration, compliance management, and parent communication responsibilities.",
    isDefault: false,
    tasks: [
      // All standard compliance
      { title: "Submit WWCC clearance", category: "Compliance", sortOrder: 1, isRequired: true },
      { title: "Submit First Aid, CPR, Anaphylaxis & Asthma certificates", category: "Compliance", sortOrder: 2, isRequired: true },
      { title: "Submit Child Protection / Mandatory Reporting certificate", category: "Compliance", sortOrder: 3, isRequired: true },
      { title: "Provide qualifications (minimum Diploma in ECEC or equivalent)", category: "Compliance", sortOrder: 4, isRequired: true },
      { title: "Complete employment contract, TFN, super and bank details", category: "HR", sortOrder: 5, isRequired: true },

      // Policies (Coordinator reads + manages)
      { title: "Read all service policies and sign acknowledgment", category: "Policies", sortOrder: 6, isRequired: true },
      { title: "Read and understand the Quality Improvement Plan (QIP)", category: "Policies", sortOrder: 7, isRequired: true },
      { title: "Familiarise with incident and complaint handling procedures", category: "Policies", sortOrder: 8, isRequired: true },

      // Leadership & Admin
      { title: "Meet with Area Manager for role expectations briefing", category: "Leadership", sortOrder: 9, isRequired: true },
      { title: "Receive handover from outgoing Coordinator (if applicable)", category: "Leadership", sortOrder: 10, isRequired: true },
      { title: "Tour the centre and meet school principal / admin staff", category: "Orientation", sortOrder: 11, isRequired: true },
      { title: "Review current enrolment list and family profiles", category: "Admin", sortOrder: 12, isRequired: true },
      { title: "Review children's medical action plans and additional needs files", category: "Admin", sortOrder: 13, isRequired: true },
      { title: "Learn the CCS (Child Care Subsidy) administration system", category: "Admin", sortOrder: 14, isRequired: true },
      { title: "Set up access to Harmony / QikKids / enrolment platform", category: "IT Setup", sortOrder: 15, isRequired: true },
      { title: "Learn rostering system and payroll submission process", category: "Admin", sortOrder: 16, isRequired: true },
      { title: "Review current staff roster and educator qualifications", category: "Staffing", sortOrder: 17, isRequired: true },
      { title: "Understand ordering process for food, supplies, and resources", category: "Operations", sortOrder: 18, isRequired: true },

      // Compliance Management
      { title: "Review NQS rating history and current self-assessment", category: "Quality", sortOrder: 19, isRequired: true },
      { title: "Understand regulatory notification requirements (serious incidents)", category: "Compliance", sortOrder: 20, isRequired: true },
      { title: "Set up compliance tracking (WWCC expiry, First Aid, ratios)", category: "Compliance", sortOrder: 21, isRequired: true },

      // Programming
      { title: "Review current program and activity planning cycle", category: "Programming", sortOrder: 22, isRequired: true },
      { title: "Understand MTOP outcomes and how they link to programming", category: "Programming", sortOrder: 23, isRequired: true },
      { title: "Review documentation and observation practices", category: "Programming", sortOrder: 24, isRequired: true },

      // Parent Communication
      { title: "Send introduction letter/email to families", category: "Communication", sortOrder: 25, isRequired: true },
      { title: "Schedule family meet-and-greet or information session", category: "Communication", sortOrder: 26, isRequired: false },

      // IT & Dashboard
      { title: "Set up Amana EOS Dashboard access (owner/admin)", category: "IT Setup", sortOrder: 27, isRequired: true },
      { title: "Learn how to use Scorecard, Rocks, and To-Dos", category: "IT Setup", sortOrder: 28, isRequired: true },

      // Probation
      { title: "Complete 2-week check-in with Area Manager", category: "Probation", sortOrder: 29, isRequired: true },
      { title: "Complete 6-week probation review", category: "Probation", sortOrder: 30, isRequired: true },
      { title: "Complete 3-month performance review", category: "Probation", sortOrder: 31, isRequired: true },
    ],
  },
  {
    name: "Casual / Relief Educator Induction",
    description:
      "Streamlined onboarding pack for casual and relief OSHC educators. Focuses on essential compliance, safety, and centre orientation so casuals can hit the ground running.",
    isDefault: false,
    tasks: [
      { title: "Submit Working With Children Check (WWCC) clearance", category: "Compliance", sortOrder: 1, isRequired: true },
      { title: "Submit valid First Aid & CPR certificate", category: "Compliance", sortOrder: 2, isRequired: true },
      { title: "Submit Anaphylaxis & Asthma management certificates", category: "Compliance", sortOrder: 3, isRequired: true },
      { title: "Complete Child Protection / Mandatory Reporting training", category: "Compliance", sortOrder: 4, isRequired: true },
      { title: "Provide proof of qualifications", category: "Compliance", sortOrder: 5, isRequired: true },
      { title: "Complete casual employment agreement and payroll forms", category: "HR", sortOrder: 6, isRequired: true },
      { title: "Read and sign Code of Conduct", category: "Policies", sortOrder: 7, isRequired: true },
      { title: "Read Child Safe Standards summary", category: "Policies", sortOrder: 8, isRequired: true },
      { title: "Read Emergency Evacuation procedures", category: "Policies", sortOrder: 9, isRequired: true },
      { title: "Read Behaviour Guidance policy summary", category: "Policies", sortOrder: 10, isRequired: true },
      { title: "Receive centre-specific orientation (layout, routines, exits)", category: "Orientation", sortOrder: 11, isRequired: true },
      { title: "Review allergy and medical action plan summary sheet", category: "Orientation", sortOrder: 12, isRequired: true },
      { title: "Learn sign-in/sign-out and parent collection procedures", category: "Orientation", sortOrder: 13, isRequired: true },
      { title: "Receive emergency contacts and coordinator phone number", category: "Orientation", sortOrder: 14, isRequired: true },
      { title: "Set up timesheet access", category: "IT Setup", sortOrder: 15, isRequired: true },
    ],
  },
  {
    name: "Administration / Office Staff Induction",
    description:
      "Onboarding pack for new administration or office-based staff who support OSHC operations (enrolments, finance, CCS, communications) but may not work directly with children.",
    isDefault: false,
    tasks: [
      { title: "Submit Working With Children Check (WWCC) — even if office-based", category: "Compliance", sortOrder: 1, isRequired: true },
      { title: "Complete employment contract, TFN, super and bank details", category: "HR", sortOrder: 2, isRequired: true },
      { title: "Read and acknowledge the Staff Handbook", category: "Policies", sortOrder: 3, isRequired: true },
      { title: "Read Privacy and Confidentiality policy", category: "Policies", sortOrder: 4, isRequired: true },
      { title: "Read Code of Conduct and sign acknowledgment", category: "Policies", sortOrder: 5, isRequired: true },
      { title: "Read Social Media and Communications policy", category: "Policies", sortOrder: 6, isRequired: true },
      { title: "Meet with manager for role expectations and KPI briefing", category: "Orientation", sortOrder: 7, isRequired: true },
      { title: "Tour head office / main centre and meet key staff", category: "Orientation", sortOrder: 8, isRequired: true },
      { title: "Set up email, staff portal, and software access", category: "IT Setup", sortOrder: 9, isRequired: true },
      { title: "Set up Amana EOS Dashboard access", category: "IT Setup", sortOrder: 10, isRequired: true },
      { title: "Learn CCS administration system (if applicable)", category: "Training", sortOrder: 11, isRequired: false },
      { title: "Learn enrolment and parent billing processes", category: "Training", sortOrder: 12, isRequired: false },
      { title: "Learn Xero / financial reporting workflows (if applicable)", category: "Training", sortOrder: 13, isRequired: false },
      { title: "Understand centre communication channels and escalation paths", category: "Training", sortOrder: 14, isRequired: true },
      { title: "Complete 2-week check-in meeting", category: "Probation", sortOrder: 15, isRequired: true },
      { title: "Complete 6-week probation review", category: "Probation", sortOrder: 16, isRequired: true },
    ],
  },
  {
    name: "Volunteer / Student Placement Induction",
    description:
      "Onboarding pack for volunteers or students on placement at OSHC centres. Focuses on child safety, centre rules, and supervision requirements.",
    isDefault: false,
    tasks: [
      { title: "Submit Working With Children Check (WWCC) clearance", category: "Compliance", sortOrder: 1, isRequired: true },
      { title: "Submit student placement letter from institution (if applicable)", category: "Documentation", sortOrder: 2, isRequired: false },
      { title: "Read and sign Code of Conduct", category: "Policies", sortOrder: 3, isRequired: true },
      { title: "Read Child Safe Standards summary", category: "Policies", sortOrder: 4, isRequired: true },
      { title: "Read Behaviour Guidance policy", category: "Policies", sortOrder: 5, isRequired: true },
      { title: "Read Photography and Social Media policy", category: "Policies", sortOrder: 6, isRequired: true },
      { title: "Understand supervision requirements (must not be left alone with children)", category: "Compliance", sortOrder: 7, isRequired: true },
      { title: "Receive centre orientation (layout, toilets, exits, first aid kits)", category: "Orientation", sortOrder: 8, isRequired: true },
      { title: "Review emergency evacuation procedures", category: "Orientation", sortOrder: 9, isRequired: true },
      { title: "Be introduced to children and supervising educator", category: "Orientation", sortOrder: 10, isRequired: true },
      { title: "Receive placement schedule and contact details", category: "Admin", sortOrder: 11, isRequired: true },
      { title: "Complete mid-placement check-in with Coordinator", category: "Review", sortOrder: 12, isRequired: false },
      { title: "Complete end-of-placement review and feedback form", category: "Review", sortOrder: 13, isRequired: false },
    ],
  },
  {
    name: "Annual Staff Compliance Renewal",
    description:
      "Annual checklist for all existing staff to renew certifications, re-read updated policies, and complete mandatory refresher training. Assign at the start of each year.",
    isDefault: false,
    tasks: [
      { title: "Verify WWCC is current and not expiring within 3 months", category: "Compliance", sortOrder: 1, isRequired: true },
      { title: "Renew First Aid certificate (if expiring within 3 months)", category: "Compliance", sortOrder: 2, isRequired: true },
      { title: "Renew CPR certificate (annual requirement)", category: "Compliance", sortOrder: 3, isRequired: true },
      { title: "Renew Anaphylaxis Management certificate (if due)", category: "Compliance", sortOrder: 4, isRequired: true },
      { title: "Renew Asthma Management certificate (if due)", category: "Compliance", sortOrder: 5, isRequired: true },
      { title: "Complete annual Child Protection / Mandatory Reporting refresher", category: "Training", sortOrder: 6, isRequired: true },
      { title: "Complete annual food safety refresher", category: "Training", sortOrder: 7, isRequired: true },
      { title: "Re-read updated Child Safe Standards policy and sign acknowledgment", category: "Policies", sortOrder: 8, isRequired: true },
      { title: "Re-read updated Code of Conduct and sign acknowledgment", category: "Policies", sortOrder: 9, isRequired: true },
      { title: "Re-read updated Emergency Management procedures", category: "Policies", sortOrder: 10, isRequired: true },
      { title: "Review any new or updated service policies since last year", category: "Policies", sortOrder: 11, isRequired: true },
      { title: "Complete annual performance self-reflection", category: "PD", sortOrder: 12, isRequired: true },
      { title: "Set professional development goals for the year", category: "PD", sortOrder: 13, isRequired: true },
      { title: "Update emergency contact details with HR", category: "Admin", sortOrder: 14, isRequired: true },
    ],
  },
];

export const POST = withApiAuth(async (req, session) => {
  try {
    const existingNames = new Set(
      (
        await prisma.onboardingPack.findMany({
          where: { deleted: false },
          select: { name: true },
        })
      ).map((p) => p.name)
    );

    let created = 0;
    const createdNames: string[] = [];

    for (const pack of ALL_PACKS) {
      if (existingNames.has(pack.name)) continue;

      await prisma.onboardingPack.create({
        data: {
          name: pack.name,
          description: pack.description,
          isDefault: pack.isDefault,
          tasks: {
            create: pack.tasks.map((t) => ({
              title: t.title,
              category: t.category,
              sortOrder: t.sortOrder,
              isRequired: t.isRequired,
            })),
          },
        },
      });

      created++;
      createdNames.push(pack.name);
    }

    return NextResponse.json({
      message: `Seeded ${created} onboarding pack(s). ${existingNames.size} already existed.`,
      created: createdNames,
      total: ALL_PACKS.length,
    });
  } catch (err) {
    logger.error("Onboarding seed error", { err });
    return NextResponse.json(
      { error: "Failed to seed onboarding packs" },
      { status: 500 }
    );
  }
}, { roles: ["owner"] });
