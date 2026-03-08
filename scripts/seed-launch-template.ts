/**
 * Seeds the "Centre Launch — 12 Week Playbook" ProjectTemplate.
 * Safe to run multiple times (skips if template already exists).
 *
 * Usage:  npx tsx scripts/seed-launch-template.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEMPLATE_NAME = "Centre Launch — 12 Week Playbook";
const TEMPLATE_DESCRIPTION =
  "Comprehensive 84-day countdown for launching a new Amana OSHC centre. " +
  "Covers regulatory, staffing, physical setup, programming, parent comms, and go-live.";
const TEMPLATE_CATEGORY = "centre-launch";

// defaultDays = days from project start (Day 0 = 84 days before go-live)
// Week 12-10 = days 0-14, Week 10-8 = days 14-28, etc.
const tasks: {
  title: string;
  description?: string;
  category: string;
  defaultDays: number;
}[] = [
  // ── Week 12-10: Regulatory & Legal ──────────────────────────
  {
    title: "Submit Service Approval application to state regulatory authority",
    description:
      "Lodge the application with the relevant state/territory body (e.g. NSW ECEC Directorate). Include proposed service details, premises plan, and staffing structure.",
    category: "Regulatory & Legal",
    defaultDays: 1,
  },
  {
    title: "Lodge Provider Approval (if new state)",
    description:
      "Required when expanding into a state where Amana is not yet an approved provider. Allow 6-8 weeks for processing.",
    category: "Regulatory & Legal",
    defaultDays: 2,
  },
  {
    title: "Obtain public liability insurance certificate",
    description:
      "Ensure $20M public liability cover is in place for the new premises. Update policy with new site address.",
    category: "Regulatory & Legal",
    defaultDays: 5,
  },
  {
    title: "Register for CCS with Department of Education",
    description:
      "Submit CCS registration via the Provider Entry Point (PEP) portal. Requires Service Approval number.",
    category: "Regulatory & Legal",
    defaultDays: 7,
  },
  {
    title: "Confirm OWNA service setup and CCS linking",
    description:
      "Create the service in OWNA, configure CCS Provider Digital Access (PRODA), and verify CCS entitlement linkage.",
    category: "Regulatory & Legal",
    defaultDays: 10,
  },
  {
    title: "Draft and localise service-specific policies",
    description:
      "Adapt Amana master policy templates for the new service. Include local emergency contacts, evacuation routes, and site-specific procedures.",
    category: "Regulatory & Legal",
    defaultDays: 14,
  },

  // ── Week 10-8: Staffing ─────────────────────────────────────
  {
    title: "Advertise Coordinator position on SEEK",
    description:
      "Post Coordinator role (Diploma of Children's Services minimum). Include Amana culture statement and salary range per Children's Services Award.",
    category: "Staffing",
    defaultDays: 15,
  },
  {
    title: "Advertise Educator positions (Cert III minimum)",
    description:
      "Post Educator roles requiring Certificate III in Children's Services. Target 4-6 educators depending on projected enrolments.",
    category: "Staffing",
    defaultDays: 16,
  },
  {
    title: "Screen and shortlist candidates",
    description:
      "Review applications, verify qualifications, and shortlist top candidates for interviews.",
    category: "Staffing",
    defaultDays: 21,
  },
  {
    title: "Conduct interviews",
    description:
      "Run structured interviews with panel. Assess alignment with Amana values, experience with school-age children, and cultural fit.",
    category: "Staffing",
    defaultDays: 24,
  },
  {
    title: "Issue employment contracts (Children's Services Award)",
    description:
      "Prepare and issue contracts under the Children's Services Award 2010. Include role descriptions, pay rates, and probation terms.",
    category: "Staffing",
    defaultDays: 26,
  },
  {
    title: "Verify WWCC and First Aid certifications",
    description:
      "Collect and verify Working With Children Checks, First Aid (including anaphylaxis and asthma), and CPR certificates for all staff.",
    category: "Staffing",
    defaultDays: 27,
  },
  {
    title: "Set up staff in OWNA and dashboard",
    description:
      "Create staff profiles in OWNA for rostering and sign-in. Add users to the Amana EOS Dashboard with appropriate role permissions.",
    category: "Staffing",
    defaultDays: 28,
  },

  // ── Week 8-6: Physical Setup ────────────────────────────────
  {
    title: "Conduct site inspection and risk assessment",
    description:
      "Walk through the premises with the WHS checklist. Document hazards, verify fencing, assess indoor/outdoor spaces, and check emergency exits.",
    category: "Physical Setup",
    defaultDays: 29,
  },
  {
    title: "Order furniture and resources (tables, chairs, storage)",
    description:
      "Order child-sized tables, chairs, shelving, storage bins, and cushions. Reference the Amana standard fit-out list.",
    category: "Physical Setup",
    defaultDays: 31,
  },
  {
    title: "Order sports equipment (Little Champions Club)",
    description:
      "Purchase sports gear for the Little Champions Club programme: soccer balls, cricket sets, skipping ropes, cones, bibs.",
    category: "Physical Setup",
    defaultDays: 32,
  },
  {
    title: "Order arts and craft supplies (Imagination Station)",
    description:
      "Stock up on art materials for the Imagination Station: paint, paper, clay, scissors, glue, recycled materials.",
    category: "Physical Setup",
    defaultDays: 33,
  },
  {
    title: "Set up homework area (Homework Heroes)",
    description:
      "Create a quiet, well-lit homework zone with desks, task lamps, stationery, and reference materials.",
    category: "Physical Setup",
    defaultDays: 35,
  },
  {
    title: "Set up kitchen/food prep area (Fuel Up with Amana)",
    description:
      "Configure food preparation area. Ensure compliance with food safety standards. Set up allergen management system and menu display.",
    category: "Physical Setup",
    defaultDays: 37,
  },
  {
    title: "Install signage and branding",
    description:
      "Install Amana OSHC exterior signage, internal wayfinding, programme zone labels, and branded welcome displays.",
    category: "Physical Setup",
    defaultDays: 39,
  },
  {
    title: "Set up check-in/sign-out system (OWNA kiosk)",
    description:
      "Install and configure the OWNA kiosk tablet for digital sign-in/sign-out. Test parent PIN access and emergency contact verification.",
    category: "Physical Setup",
    defaultDays: 42,
  },

  // ── Week 6-4: Programming & Systems ─────────────────────────
  {
    title: "Create initial weekly programme template",
    description:
      "Design the master weekly timetable covering BSC (Rise and Shine Club) and ASC (Amana Afternoons) with all programme zones.",
    category: "Programming & Systems",
    defaultDays: 43,
  },
  {
    title: "Set up Rise and Shine Club (BSC) programme",
    description:
      "Configure the BSC programme: 6:30-9:00am. Include breakfast service (Fuel Up), free play, homework support, and morning activities.",
    category: "Programming & Systems",
    defaultDays: 45,
  },
  {
    title: "Set up Amana Afternoons (ASC) programme",
    description:
      "Configure the ASC programme: 3:00-6:00pm. Include afternoon tea, Homework Heroes, Imagination Station, Little Champions Club, Iqra Circle, and free play.",
    category: "Programming & Systems",
    defaultDays: 47,
  },
  {
    title: "Create Iqra Circle schedule",
    description:
      "Plan the Iqra Circle component: Islamic values circle time, Quran recitation, character education. Coordinate with local imam if needed.",
    category: "Programming & Systems",
    defaultDays: 49,
  },
  {
    title: "Set up menu plans in OWNA",
    description:
      "Create 4-week rotating menu in OWNA. Ensure halal compliance, allergen labelling, and alignment with Fuel Up with Amana nutritional guidelines.",
    category: "Programming & Systems",
    defaultDays: 51,
  },
  {
    title: "Configure OWNA booking types and session rates",
    description:
      "Set up BSC ($26 regular / $31 casual) and ASC ($36 regular / $41 casual) session types. Configure CCS fee reduction calculations.",
    category: "Programming & Systems",
    defaultDays: 53,
  },
  {
    title: "Set up Xero tracking category for new centre",
    description:
      "Create a Xero tracking category for the new centre. Map to the dashboard financial module for automated P&L reporting.",
    category: "Programming & Systems",
    defaultDays: 56,
  },

  // ── Week 4-2: Parent Communication ──────────────────────────
  {
    title: "Design centre-specific welcome pack",
    description:
      "Create a branded welcome pack including: centre overview, daily schedule, what to bring, emergency procedures, fee schedule, and parent handbook.",
    category: "Parent Communication",
    defaultDays: 57,
  },
  {
    title: "Create enrolment information guide",
    description:
      "Prepare parent-facing enrolment guide covering: CCS entitlements, how to enrol via OWNA, required documentation, and fee explanation.",
    category: "Parent Communication",
    defaultDays: 59,
  },
  {
    title: "Set up parent WhatsApp group",
    description:
      "Create and configure the parent WhatsApp community group. Add centre coordinator as admin. Prepare welcome message template.",
    category: "Parent Communication",
    defaultDays: 61,
  },
  {
    title: "Draft launch announcement for school community",
    description:
      "Write announcement for school newsletter, notice boards, and parent communication channels. Include open day invitation and enrolment details.",
    category: "Parent Communication",
    defaultDays: 63,
  },
  {
    title: "Create social media launch campaign",
    description:
      "Prepare 2-week social media campaign across Facebook and Instagram. Include centre photos, staff introductions, programme highlights, and enrolment CTA.",
    category: "Parent Communication",
    defaultDays: 65,
  },
  {
    title: 'Send "What to bring" guide to enrolled families',
    description:
      "Distribute the what-to-bring checklist to all enrolled families via OWNA notifications and WhatsApp. Include: hat, water bottle, spare clothes, lunch box.",
    category: "Parent Communication",
    defaultDays: 68,
  },
  {
    title: "Host parent information evening",
    description:
      "Run an evening information session at the school. Cover programme overview, staff introductions, centre tour, Q&A, and enrolment sign-up assistance.",
    category: "Parent Communication",
    defaultDays: 70,
  },

  // ── Week 2-0: Go-Live ───────────────────────────────────────
  {
    title: "Conduct full staff induction (2 days)",
    description:
      "Run comprehensive 2-day induction covering: Amana values and culture, policies and procedures, child protection, WHS, programme delivery, OWNA training, and emergency drills.",
    category: "Go-Live",
    defaultDays: 71,
  },
  {
    title: "Run practice session with team (no children)",
    description:
      "Simulate a full day of operations with the team. Walk through arrival, transitions, activities, meal service, homework time, and departure. Identify and fix gaps.",
    category: "Go-Live",
    defaultDays: 74,
  },
  {
    title: "Final compliance checklist walkthrough",
    description:
      "Complete the pre-launch compliance checklist: ratios confirmed, all staff clearances verified, first aid kit stocked, medication forms ready, incident report forms accessible.",
    category: "Go-Live",
    defaultDays: 77,
  },
  {
    title: "Confirm emergency procedures and evacuation plan",
    description:
      "Verify emergency evacuation plan is posted, assembly points are marked, fire extinguishers are current, and all staff know their emergency roles.",
    category: "Go-Live",
    defaultDays: 78,
  },
  {
    title: "Test OWNA sign-in/out system",
    description:
      "Run end-to-end test of the OWNA kiosk: parent sign-in with PIN, emergency contact verification, sign-out process, absence notifications. Verify data flows to dashboard.",
    category: "Go-Live",
    defaultDays: 80,
  },
  {
    title: "Confirm all parent enrolments are processed",
    description:
      "Verify all enrolment forms are complete, CCS entitlements are linked, parent accounts are active in OWNA, and first-week bookings are confirmed.",
    category: "Go-Live",
    defaultDays: 82,
  },
  {
    title: "Day 1 — GO LIVE 🚀",
    description:
      "Launch day! All hands on deck. Coordinator to arrive 1 hour early. Welcome families, manage sign-ins, deliver first programme session. Debrief with team at end of day.",
    category: "Go-Live",
    defaultDays: 84,
  },
];

async function main() {
  // Check if template already exists
  const existing = await prisma.projectTemplate.findFirst({
    where: { name: TEMPLATE_NAME },
  });

  if (existing) {
    console.log(`✓ Template "${TEMPLATE_NAME}" already exists (id: ${existing.id}). Skipping.`);
    return;
  }

  const template = await prisma.projectTemplate.create({
    data: {
      name: TEMPLATE_NAME,
      description: TEMPLATE_DESCRIPTION,
      category: TEMPLATE_CATEGORY,
      tasks: {
        create: tasks.map((t, i) => ({
          title: t.title,
          description: t.description ?? null,
          category: t.category,
          sortOrder: i,
          defaultDays: t.defaultDays,
        })),
      },
    },
    include: { tasks: true },
  });

  console.log(`✓ Created template "${template.name}" with ${template.tasks.length} tasks.`);
  console.log(`  ID: ${template.id}`);
  console.log(`  Categories: ${[...new Set(tasks.map((t) => t.category))].join(", ")}`);
}

main()
  .catch((err) => {
    console.error("Failed to seed launch template:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
