import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * POST /api/project-templates/seed
 *
 * Owner-only endpoint that seeds any missing project templates.
 * Safe to call multiple times — skips templates that already exist by name.
 */

const ALL_TEMPLATES = [
  {
    name: "New Centre Opening",
    description: "Complete checklist for launching a new OSHC centre at a school site. Covers compliance, staffing, setup, and marketing.",
    category: "Operations",
    tasks: [
      { title: "Sign LOI with school principal", category: "Legal", sortOrder: 1, defaultDays: 7 },
      { title: "Complete site risk assessment", category: "Compliance", sortOrder: 2, defaultDays: 14 },
      { title: "Submit service approval application to state authority", category: "Compliance", sortOrder: 3, defaultDays: 14 },
      { title: "Set up centre in CCS (Child Care Subsidy) system", category: "Compliance", sortOrder: 4, defaultDays: 21 },
      { title: "Recruit and hire Centre Coordinator", category: "Staffing", sortOrder: 5, defaultDays: 21 },
      { title: "Recruit and hire 2 Educators", category: "Staffing", sortOrder: 6, defaultDays: 28 },
      { title: "Complete Working With Children checks for all staff", category: "Staffing", sortOrder: 7, defaultDays: 28 },
      { title: "Order furniture, equipment, and resources", category: "Setup", sortOrder: 8, defaultDays: 21 },
      { title: "Set up storage and kitchen area", category: "Setup", sortOrder: 9, defaultDays: 28 },
      { title: "Install signage and branding", category: "Setup", sortOrder: 10, defaultDays: 30 },
      { title: "Create QIP (Quality Improvement Plan)", category: "Compliance", sortOrder: 11, defaultDays: 30 },
      { title: "Set up enrolment system and parent portal", category: "Admin", sortOrder: 12, defaultDays: 14 },
      { title: "Distribute flyers and info packs to school families", category: "Marketing", sortOrder: 13, defaultDays: 14 },
      { title: "Host parent information evening", category: "Marketing", sortOrder: 14, defaultDays: 35 },
      { title: "Process initial enrolments (target: 20+)", category: "Admin", sortOrder: 15, defaultDays: 42 },
      { title: "Finalise rosters and shifts", category: "Staffing", sortOrder: 16, defaultDays: 40 },
      { title: "Conduct trial run / soft opening", category: "Operations", sortOrder: 17, defaultDays: 45 },
      { title: "Official opening day", category: "Operations", sortOrder: 18, defaultDays: 49 },
    ],
  },
  {
    name: "Annual Compliance Audit",
    description: "Annual NQS (National Quality Standard) self-assessment and compliance review for an existing centre.",
    category: "Compliance",
    tasks: [
      { title: "Review and update policies and procedures", category: "Documentation", sortOrder: 1, defaultDays: 7 },
      { title: "Conduct staff-to-child ratio audit", category: "Staffing", sortOrder: 2, defaultDays: 7 },
      { title: "Review all staff qualifications and certifications", category: "Staffing", sortOrder: 3, defaultDays: 10 },
      { title: "Update emergency evacuation plan and conduct drill", category: "Safety", sortOrder: 4, defaultDays: 14 },
      { title: "Inspect all first aid kits and medications", category: "Safety", sortOrder: 5, defaultDays: 7 },
      { title: "Review incident/accident register", category: "Documentation", sortOrder: 6, defaultDays: 10 },
      { title: "NQS self-assessment across all 7 quality areas", category: "Quality", sortOrder: 7, defaultDays: 21 },
      { title: "Update Quality Improvement Plan (QIP)", category: "Quality", sortOrder: 8, defaultDays: 28 },
      { title: "Parent survey and feedback review", category: "Quality", sortOrder: 9, defaultDays: 21 },
      { title: "Submit compliance report to management", category: "Documentation", sortOrder: 10, defaultDays: 30 },
    ],
  },
  {
    name: "Term Marketing Campaign",
    description: "Quarterly marketing campaign to boost enrolments and community engagement.",
    category: "Marketing",
    tasks: [
      { title: "Define campaign goals and target numbers", category: "Strategy", sortOrder: 1, defaultDays: 3 },
      { title: "Design social media content calendar", category: "Content", sortOrder: 2, defaultDays: 7 },
      { title: "Create flyers and posters for school distribution", category: "Content", sortOrder: 3, defaultDays: 10 },
      { title: "Update website with current term info", category: "Digital", sortOrder: 4, defaultDays: 7 },
      { title: "Schedule community open day", category: "Events", sortOrder: 5, defaultDays: 14 },
      { title: "Run social media ads campaign", category: "Digital", sortOrder: 6, defaultDays: 14 },
      { title: "Collect and share parent testimonials", category: "Content", sortOrder: 7, defaultDays: 21 },
      { title: "Review campaign results and adjust", category: "Strategy", sortOrder: 8, defaultDays: 28 },
    ],
  },
  {
    name: "Staff Training & Induction Program",
    description: "Onboarding checklist for new educators including WWCC, first aid, safeguarding, and centre-specific training.",
    category: "Staffing",
    tasks: [
      { title: "Verify Working With Children Check (WWCC)", category: "Compliance", sortOrder: 1, defaultDays: 3 },
      { title: "Complete First Aid & CPR certification", category: "Training", sortOrder: 2, defaultDays: 7 },
      { title: "Complete Child Protection / Safeguarding module", category: "Training", sortOrder: 3, defaultDays: 7 },
      { title: "Review My Time Our Place (MTOP) framework", category: "Training", sortOrder: 4, defaultDays: 10 },
      { title: "Shadow experienced educator for 3 sessions", category: "Induction", sortOrder: 5, defaultDays: 10 },
      { title: "Complete food safety & allergy management training", category: "Training", sortOrder: 6, defaultDays: 10 },
      { title: "Read and sign centre policies and procedures", category: "Compliance", sortOrder: 7, defaultDays: 5 },
      { title: "Set up staff portal login and timesheet access", category: "Admin", sortOrder: 8, defaultDays: 3 },
      { title: "Complete anaphylaxis and asthma management training", category: "Training", sortOrder: 9, defaultDays: 14 },
      { title: "Conduct orientation walkthrough with Centre Coordinator", category: "Induction", sortOrder: 10, defaultDays: 5 },
      { title: "Complete probation review meeting", category: "HR", sortOrder: 11, defaultDays: 45 },
    ],
  },
  {
    name: "Vacation Care Program Planning",
    description: "End-to-end planning for school holiday vacation care including program design, excursions, staffing, and enrolments.",
    category: "Programs",
    tasks: [
      { title: "Set vacation care dates and operating hours", category: "Planning", sortOrder: 1, defaultDays: 3 },
      { title: "Design weekly activity themes and program schedule", category: "Programming", sortOrder: 2, defaultDays: 10 },
      { title: "Research and book excursion venues", category: "Excursions", sortOrder: 3, defaultDays: 14 },
      { title: "Complete risk assessments for all excursions", category: "Compliance", sortOrder: 4, defaultDays: 18 },
      { title: "Arrange bus/transport for excursion days", category: "Logistics", sortOrder: 5, defaultDays: 18 },
      { title: "Design and send vacation care brochure to families", category: "Marketing", sortOrder: 6, defaultDays: 14 },
      { title: "Open enrolments and manage bookings", category: "Admin", sortOrder: 7, defaultDays: 14 },
      { title: "Confirm additional casual staff for holiday period", category: "Staffing", sortOrder: 8, defaultDays: 21 },
      { title: "Order supplies, craft materials, and catering", category: "Logistics", sortOrder: 9, defaultDays: 21 },
      { title: "Prepare sign-in/sign-out sheets and emergency contacts", category: "Admin", sortOrder: 10, defaultDays: 25 },
      { title: "Final program review and staff briefing", category: "Planning", sortOrder: 11, defaultDays: 28 },
      { title: "Post-vacation care family feedback survey", category: "Quality", sortOrder: 12, defaultDays: 49 },
    ],
  },
  {
    name: "Assessment & Rating Preparation",
    description: "Prepare for ACECQA Assessment & Rating visit. Covers all 7 NQS quality areas with evidence collection and self-assessment.",
    category: "Compliance",
    tasks: [
      { title: "Conduct NQS self-assessment across all 7 quality areas", category: "Assessment", sortOrder: 1, defaultDays: 14 },
      { title: "Update Quality Improvement Plan (QIP) with current goals", category: "Documentation", sortOrder: 2, defaultDays: 14 },
      { title: "Gather evidence for QA1 - Educational program and practice", category: "Evidence", sortOrder: 3, defaultDays: 21 },
      { title: "Gather evidence for QA2 - Children's health and safety", category: "Evidence", sortOrder: 4, defaultDays: 21 },
      { title: "Gather evidence for QA3 - Physical environment", category: "Evidence", sortOrder: 5, defaultDays: 21 },
      { title: "Gather evidence for QA4 - Staffing arrangements", category: "Evidence", sortOrder: 6, defaultDays: 21 },
      { title: "Gather evidence for QA5 - Relationships with children", category: "Evidence", sortOrder: 7, defaultDays: 21 },
      { title: "Gather evidence for QA6 - Collaborative partnerships", category: "Evidence", sortOrder: 8, defaultDays: 21 },
      { title: "Gather evidence for QA7 - Governance and leadership", category: "Evidence", sortOrder: 9, defaultDays: 21 },
      { title: "Review and update all required policies", category: "Documentation", sortOrder: 10, defaultDays: 28 },
      { title: "Conduct mock assessment walk-through with team", category: "Preparation", sortOrder: 11, defaultDays: 35 },
      { title: "Staff coaching sessions on speaking to assessors", category: "Preparation", sortOrder: 12, defaultDays: 35 },
      { title: "Ensure all displays, documentation, and signage current", category: "Environment", sortOrder: 13, defaultDays: 40 },
      { title: "Final team briefing before A&R visit", category: "Preparation", sortOrder: 14, defaultDays: 42 },
    ],
  },
  {
    name: "Parent & Community Engagement Initiative",
    description: "Build stronger relationships with families through events, surveys, and communication improvements.",
    category: "Community",
    tasks: [
      { title: "Design and distribute parent satisfaction survey", category: "Feedback", sortOrder: 1, defaultDays: 7 },
      { title: "Analyse survey results and identify improvement areas", category: "Feedback", sortOrder: 2, defaultDays: 14 },
      { title: "Plan family open day / showcase event", category: "Events", sortOrder: 3, defaultDays: 10 },
      { title: "Set up parent communication channel (app/email)", category: "Communication", sortOrder: 4, defaultDays: 7 },
      { title: "Create monthly parent newsletter template", category: "Communication", sortOrder: 5, defaultDays: 10 },
      { title: "Organise cultural celebration event", category: "Events", sortOrder: 6, defaultDays: 21 },
      { title: "Establish parent advisory group", category: "Governance", sortOrder: 7, defaultDays: 21 },
      { title: "Implement daily photo/activity updates for parents", category: "Communication", sortOrder: 8, defaultDays: 14 },
      { title: "Follow-up survey to measure improvement", category: "Feedback", sortOrder: 9, defaultDays: 60 },
    ],
  },
  {
    name: "Safety & Emergency Preparedness Review",
    description: "Comprehensive safety audit and emergency preparedness review for OSHC centres.",
    category: "Safety",
    tasks: [
      { title: "Review and update emergency management plan", category: "Emergency", sortOrder: 1, defaultDays: 7 },
      { title: "Conduct fire evacuation drill and document", category: "Emergency", sortOrder: 2, defaultDays: 10 },
      { title: "Conduct lockdown drill and document", category: "Emergency", sortOrder: 3, defaultDays: 14 },
      { title: "Inspect all fire extinguishers and safety equipment", category: "Equipment", sortOrder: 4, defaultDays: 7 },
      { title: "Review and restock all first aid kits", category: "First Aid", sortOrder: 5, defaultDays: 7 },
      { title: "Update medical action plans for enrolled children", category: "Medical", sortOrder: 6, defaultDays: 10 },
      { title: "Complete workplace hazard inspection", category: "WHS", sortOrder: 7, defaultDays: 14 },
      { title: "Update emergency contact lists for all families", category: "Admin", sortOrder: 8, defaultDays: 10 },
      { title: "Verify all staff first aid certifications are current", category: "Compliance", sortOrder: 9, defaultDays: 7 },
      { title: "Submit safety audit report to management", category: "Reporting", sortOrder: 10, defaultDays: 21 },
    ],
  },
  {
    name: "School Sales Cycle",
    description: "End-to-end sales pipeline for pitching OSHC services to a new school partner.",
    category: "Growth",
    tasks: [
      { title: "Research school demographics and current OSHC provider", category: "Research", sortOrder: 1, defaultDays: 7 },
      { title: "Prepare tailored pitch deck for the school", category: "Preparation", sortOrder: 2, defaultDays: 10 },
      { title: "Make initial contact with school principal / board", category: "Outreach", sortOrder: 3, defaultDays: 5 },
      { title: "Schedule and conduct site visit at the school", category: "Meeting", sortOrder: 4, defaultDays: 14 },
      { title: "Present OSHC service proposal to school leadership", category: "Meeting", sortOrder: 5, defaultDays: 7 },
      { title: "Address questions and negotiate terms", category: "Negotiation", sortOrder: 6, defaultDays: 14 },
      { title: "Draft and send Letter of Intent (LOI)", category: "Legal", sortOrder: 7, defaultDays: 7 },
      { title: "Finalise licence or lease agreement", category: "Legal", sortOrder: 8, defaultDays: 21 },
      { title: "Plan transition / launch timeline with school", category: "Planning", sortOrder: 9, defaultDays: 14 },
      { title: "Announce new service to school community", category: "Communication", sortOrder: 10, defaultDays: 7 },
    ],
  },
  {
    name: "Tender Application",
    description: "Structured workflow for preparing and submitting an OSHC tender once it is released.",
    category: "Growth",
    tasks: [
      { title: "Review tender documents and mandatory criteria", category: "Review", sortOrder: 1, defaultDays: 3 },
      { title: "Attend tender briefing session (if available)", category: "Meeting", sortOrder: 2, defaultDays: 7 },
      { title: "Identify and assign response writers per section", category: "Planning", sortOrder: 3, defaultDays: 3 },
      { title: "Draft executive summary and organisational overview", category: "Drafting", sortOrder: 4, defaultDays: 10 },
      { title: "Prepare proposed service model and programming", category: "Drafting", sortOrder: 5, defaultDays: 10 },
      { title: "Compile financial projections and fee schedule", category: "Finance", sortOrder: 6, defaultDays: 10 },
      { title: "Gather compliance evidence (CCS approval, insurance, policies)", category: "Compliance", sortOrder: 7, defaultDays: 7 },
      { title: "Collect referee statements and testimonials", category: "Evidence", sortOrder: 8, defaultDays: 10 },
      { title: "Internal review and quality check of full submission", category: "Review", sortOrder: 9, defaultDays: 5 },
      { title: "Format submission per tender requirements", category: "Formatting", sortOrder: 10, defaultDays: 3 },
      { title: "Submit tender before deadline", category: "Submission", sortOrder: 11, defaultDays: 1 },
    ],
  },
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

export async function POST() {
  const { error } = await requireAuth(["owner"]);
  if (error) return error;

  try {
    const existingNames = new Set(
      (await prisma.projectTemplate.findMany({ select: { name: true } })).map(
        (t) => t.name
      )
    );

    let created = 0;
    const createdNames: string[] = [];

    for (const tmpl of ALL_TEMPLATES) {
      if (existingNames.has(tmpl.name)) continue;

      await prisma.projectTemplate.create({
        data: {
          name: tmpl.name,
          description: tmpl.description,
          category: tmpl.category,
          tasks: { create: tmpl.tasks },
        },
      });

      created++;
      createdNames.push(tmpl.name);
    }

    return NextResponse.json({
      message: `Seeded ${created} missing template(s). ${existingNames.size} already existed.`,
      created: createdNames,
      total: ALL_TEMPLATES.length,
    });
  } catch (err) {
    console.error("Template seed error:", err);
    return NextResponse.json(
      { error: "Failed to seed templates" },
      { status: 500 }
    );
  }
}
