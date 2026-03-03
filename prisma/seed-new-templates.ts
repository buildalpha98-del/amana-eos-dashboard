/**
 * One-time script to add 4 new OSHC templates to an existing database.
 * Run with: npx tsx prisma/seed-new-templates.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const newTemplates = [
  {
    name: "Quality Improvement Plan (QIP) Development",
    description: "Develop or refresh the service QIP aligned to the National Quality Framework. Covers self-assessment, goal setting, evidence collection, and regulatory submission.",
    category: "Quality",
    tasks: [
      { title: "Review current NQS ratings and previous QIP", category: "Assessment", sortOrder: 1, defaultDays: 7 },
      { title: "Distribute staff self-assessment surveys across 7 quality areas", category: "Assessment", sortOrder: 2, defaultDays: 10 },
      { title: "Collect family and community input on service strengths", category: "Consultation", sortOrder: 3, defaultDays: 14 },
      { title: "Analyse assessment data and identify priority improvement areas", category: "Analysis", sortOrder: 4, defaultDays: 18 },
      { title: "Draft QIP goals with SMART targets for each priority area", category: "Planning", sortOrder: 5, defaultDays: 21 },
      { title: "Assign responsible persons and timelines per goal", category: "Planning", sortOrder: 6, defaultDays: 24 },
      { title: "Develop evidence collection plan for each quality area", category: "Evidence", sortOrder: 7, defaultDays: 28 },
      { title: "Create progress tracking system (checklist or digital tool)", category: "Systems", sortOrder: 8, defaultDays: 28 },
      { title: "Conduct team workshop to present and discuss QIP goals", category: "Engagement", sortOrder: 9, defaultDays: 30 },
      { title: "Display QIP summary for families and stakeholders", category: "Communication", sortOrder: 10, defaultDays: 35 },
      { title: "Submit updated QIP to regulatory authority (if required)", category: "Compliance", sortOrder: 11, defaultDays: 40 },
      { title: "Schedule quarterly QIP progress reviews", category: "Governance", sortOrder: 12, defaultDays: 42 },
      { title: "Conduct first quarterly review and update progress notes", category: "Review", sortOrder: 13, defaultDays: 90 },
    ],
  },
  {
    name: "Educator Professional Development Cycle",
    description: "Annual professional development cycle for educators including performance appraisals, goal setting, training plans, mentoring, and certification tracking.",
    category: "Staffing",
    tasks: [
      { title: "Schedule annual performance appraisals for all educators", category: "Planning", sortOrder: 1, defaultDays: 7 },
      { title: "Distribute educator self-reflection worksheets", category: "Assessment", sortOrder: 2, defaultDays: 10 },
      { title: "Conduct one-on-one appraisal meetings with each educator", category: "Appraisals", sortOrder: 3, defaultDays: 21 },
      { title: "Collaboratively set individual PD goals aligned to NQS", category: "Goal Setting", sortOrder: 4, defaultDays: 28 },
      { title: "Create annual training calendar (First Aid, WWCC renewals, CPR)", category: "Planning", sortOrder: 5, defaultDays: 14 },
      { title: "Identify and book external PD workshops or conferences", category: "Training", sortOrder: 6, defaultDays: 21 },
      { title: "Set up peer mentoring pairs for new and experienced educators", category: "Mentoring", sortOrder: 7, defaultDays: 14 },
      { title: "Schedule monthly team learning sessions (MTOP, inclusion, behaviour)", category: "Training", sortOrder: 8, defaultDays: 14 },
      { title: "Track and update certification expiry dates for all staff", category: "Compliance", sortOrder: 9, defaultDays: 10 },
      { title: "Compile PD participation records for each educator", category: "Documentation", sortOrder: 10, defaultDays: 30 },
      { title: "Conduct mid-year PD goal check-in meetings", category: "Review", sortOrder: 11, defaultDays: 90 },
      { title: "Evaluate PD program effectiveness and gather educator feedback", category: "Evaluation", sortOrder: 12, defaultDays: 120 },
      { title: "Prepare end-of-year PD summary report for management", category: "Reporting", sortOrder: 13, defaultDays: 150 },
    ],
  },
  {
    name: "Inclusion Support Program Setup",
    description: "Set up individualised support for a child with additional needs. Covers ISP meetings, funding applications, environment modifications, and staff training.",
    category: "Inclusion",
    tasks: [
      { title: "Meet with family to understand child's needs and routines", category: "Consultation", sortOrder: 1, defaultDays: 5 },
      { title: "Obtain relevant reports (paediatrician, OT, speech, psychologist)", category: "Documentation", sortOrder: 2, defaultDays: 10 },
      { title: "Contact Inclusion Agency for guidance and support", category: "External", sortOrder: 3, defaultDays: 7 },
      { title: "Develop Individual Support Plan (ISP) with strategies", category: "Planning", sortOrder: 4, defaultDays: 14 },
      { title: "Apply for Inclusion Support Subsidy (ISS) via CCCMS portal", category: "Funding", sortOrder: 5, defaultDays: 14 },
      { title: "Conduct environment review for accessibility and sensory needs", category: "Environment", sortOrder: 6, defaultDays: 10 },
      { title: "Purchase any specialised equipment or resources", category: "Resources", sortOrder: 7, defaultDays: 21 },
      { title: "Provide targeted training for educators (e.g. autism, ADHD, sensory)", category: "Training", sortOrder: 8, defaultDays: 14 },
      { title: "Recruit and onboard additional support worker (if ISS approved)", category: "Staffing", sortOrder: 9, defaultDays: 28 },
      { title: "Implement visual schedules and transition supports", category: "Programming", sortOrder: 10, defaultDays: 14 },
      { title: "Schedule regular ISP review meetings with family and specialists", category: "Review", sortOrder: 11, defaultDays: 21 },
      { title: "Document observations and progress notes for ISP evidence", category: "Documentation", sortOrder: 12, defaultDays: 30 },
      { title: "Conduct formal ISP review and update goals", category: "Review", sortOrder: 13, defaultDays: 60 },
    ],
  },
  {
    name: "Service Policy Review Cycle",
    description: "Systematic review and update of all service policies to ensure NQF compliance, alignment with current legislation, and reflection of best practice in OSHC.",
    category: "Governance",
    tasks: [
      { title: "Compile master list of all current service policies with review dates", category: "Audit", sortOrder: 1, defaultDays: 7 },
      { title: "Identify policies due for review and prioritise by urgency", category: "Audit", sortOrder: 2, defaultDays: 10 },
      { title: "Review Child Safe Standards and child protection policies", category: "Critical", sortOrder: 3, defaultDays: 14 },
      { title: "Review behaviour guidance and anti-bullying policies", category: "Wellbeing", sortOrder: 4, defaultDays: 18 },
      { title: "Review nutrition, food safety, and allergy management policies", category: "Health", sortOrder: 5, defaultDays: 21 },
      { title: "Review excursion, transport, and sun safety policies", category: "Safety", sortOrder: 6, defaultDays: 24 },
      { title: "Review privacy, social media, and photography policies", category: "Governance", sortOrder: 7, defaultDays: 28 },
      { title: "Review WHS, emergency management, and incident reporting policies", category: "Safety", sortOrder: 8, defaultDays: 30 },
      { title: "Review enrolment, fee, and CCS administration policies", category: "Admin", sortOrder: 9, defaultDays: 32 },
      { title: "Consult educators on practical application and gaps", category: "Consultation", sortOrder: 10, defaultDays: 35 },
      { title: "Consult families on relevant policies (e.g. complaints, feedback)", category: "Consultation", sortOrder: 11, defaultDays: 38 },
      { title: "Finalise updated policies and obtain management sign-off", category: "Approval", sortOrder: 12, defaultDays: 42 },
      { title: "Distribute updated policies to all staff with acknowledgment", category: "Communication", sortOrder: 13, defaultDays: 45 },
      { title: "Update policy folder, website, and parent handbook", category: "Documentation", sortOrder: 14, defaultDays: 48 },
      { title: "Set next review dates and add to annual calendar", category: "Planning", sortOrder: 15, defaultDays: 50 },
    ],
  },
];

async function main() {
  for (const tmpl of newTemplates) {
    const existing = await prisma.projectTemplate.findFirst({
      where: { name: tmpl.name },
    });
    if (existing) {
      console.log(`Skipping "${tmpl.name}" (already exists)`);
      continue;
    }
    await prisma.projectTemplate.create({
      data: {
        name: tmpl.name,
        description: tmpl.description,
        category: tmpl.category,
        tasks: { create: tmpl.tasks },
      },
    });
    console.log(`Created "${tmpl.name}" (${tmpl.tasks.length} tasks)`);
  }
  console.log("Done!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
