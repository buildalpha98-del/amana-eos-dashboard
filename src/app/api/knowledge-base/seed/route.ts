import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const seedArticles = [
  // Getting Started
  {
    title: "What is the EOS Dashboard?",
    body: "The EOS Dashboard is the Entrepreneurial Operating System management tool for Amana OSHC centres. It brings together your Rocks, To-Dos, Scorecard, Issues, and V/TO into one place so your leadership team can run the business on EOS with full visibility across every centre.",
    category: "getting_started",
    slug: "what-is-eos-dashboard",
    sortOrder: 1,
    audienceRoles: [],
  },
  {
    title: "How do I navigate the dashboard?",
    body: "The sidebar on the left organises the dashboard into sections: EOS (Dashboard, My Portal, Vision, Rocks, To-Dos, Issues, Scorecard), Operations (Financials, Performance, Services, Compliance), Strategy (Scenarios, Data Room, Board Reports, AI Assistant), Engagement (Enquiries, CRM, Marketing, Communication, Conversions, Projects, Meetings), HR (Recruitment, Timesheets, Leave, Contracts), Support (Tickets), Tools (CCS Calculator, The Amana Way), and Admin (Documents, Staff Lifecycle, Team, Settings). Click any item to navigate to that page.",
    category: "getting_started",
    slug: "how-to-navigate",
    sortOrder: 2,
    audienceRoles: [],
  },
  {
    title: "What's My Portal?",
    body: "My Portal is your personal hub within the dashboard. It shows your profile information, upcoming leave, training progress, compliance certificate status, and any action items assigned to you. Think of it as your personalised home page where you can manage everything related to your role.",
    category: "getting_started",
    slug: "whats-my-portal",
    sortOrder: 3,
    audienceRoles: [],
  },

  // EOS Basics
  {
    title: "What are Rocks?",
    body: "Rocks are your 90-day quarterly priorities — the 3 to 7 most important things to accomplish this quarter. They keep the team focused on what matters most and prevent the day-to-day from taking over. Each Rock has an owner, a due date (end of quarter), and a status (on track, off track, or complete).",
    category: "eos_basics",
    slug: "what-are-rocks",
    sortOrder: 1,
    audienceRoles: [],
  },
  {
    title: "What are To-Dos?",
    body: "To-Dos are 7-day action items that come from your weekly Level 10 (L10) meetings. They're short, specific tasks that should be completable within one week. Each To-Do has an owner and a due date. If a To-Do isn't done in 7 days, it rolls forward and gets discussed in the next meeting.",
    category: "eos_basics",
    slug: "what-are-todos",
    sortOrder: 2,
    audienceRoles: [],
  },
  {
    title: "What is IDS?",
    body: "IDS stands for Identify, Discuss, Solve — it's the EOS method for resolving issues. First, you Identify the real issue (not just the symptom). Then you Discuss it openly as a team. Finally, you Solve it by agreeing on a concrete action (usually a To-Do). IDS keeps meetings productive and stops circular conversations.",
    category: "eos_basics",
    slug: "what-is-ids",
    sortOrder: 3,
    audienceRoles: [],
  },
  {
    title: "What is the Scorecard?",
    body: "The Scorecard is a weekly set of measurables (KPIs) that tell you if the business is on track. Each measurable has an owner, a target, and is updated weekly. By tracking 5-15 numbers consistently, you can spot trends and catch problems before they become crises.",
    category: "eos_basics",
    slug: "what-is-scorecard",
    sortOrder: 4,
    audienceRoles: [],
  },
  {
    title: "What is V/TO?",
    body: "V/TO stands for Vision/Traction Organiser. It's your long-term strategic plan that defines your 10-year target, 3-year picture, 1-year plan, and quarterly Rocks. It also captures your core values, core focus, and marketing strategy. The V/TO keeps the entire team aligned on where you're going.",
    category: "eos_basics",
    slug: "what-is-vto",
    sortOrder: 5,
    audienceRoles: [],
  },
  {
    title: "What is a Level 10 Meeting?",
    body: "A Level 10 (L10) Meeting is a structured weekly 90-minute team meeting following the EOS agenda. The agenda includes: Segue (good news), Scorecard review, Rock review, Customer/Employee headlines, To-Do review, IDS (Issues solving), and Conclude. The goal is to rate the meeting a 10 out of 10 every week.",
    category: "eos_basics",
    slug: "what-is-l10-meeting",
    sortOrder: 6,
    audienceRoles: [],
  },

  // HR
  {
    title: "How do I submit a leave request?",
    body: "Go to My Portal or the Leave page from the sidebar. Click 'Request Leave', select your leave type (annual, personal, unpaid, etc.), choose your start and end dates, add any notes, and submit. Your request will go to your manager for approval. You'll be notified once it's approved or declined.",
    category: "hr",
    slug: "submit-leave-request",
    sortOrder: 1,
    audienceRoles: [],
  },
  {
    title: "How do I check my compliance certificates?",
    body: "Go to My Portal and scroll to the Compliance section. You'll see all your certificates with their expiry dates. Certificates that are expiring soon will be highlighted in amber, and expired certificates will show in red. You can upload new certificates directly from this section.",
    category: "hr",
    slug: "check-compliance-certificates",
    sortOrder: 2,
    audienceRoles: [],
  },
  {
    title: "How do I view my timesheets?",
    body: "Coordinators import OWNA rosters into the system. Once imported, you can view your shifts and hours on the Timesheets page (accessible from the HR section in the sidebar). If you notice any discrepancies, raise it with your coordinator.",
    category: "hr",
    slug: "view-timesheets",
    sortOrder: 3,
    audienceRoles: [],
  },

  // Compliance
  {
    title: "What compliance certificates do I need?",
    body: "All educators need a current Working with Children Check (WWCC), First Aid certificate, CPR certificate (renewed annually), Anaphylaxis Management training, and Asthma Management training. Depending on your role, you may also need Child Protection training, a GECCKO certificate, Food Safety, or Food Handler certification. Check My Portal for your specific requirements.",
    category: "compliance",
    slug: "required-certificates",
    sortOrder: 1,
    audienceRoles: [],
  },
  {
    title: "What happens when a certificate expires?",
    body: "The system automatically monitors expiry dates and sends you email alerts at 30 days and 7 days before a certificate expires. Expired certificates are flagged on your profile and reported to centre management. It's important to renew before expiry to maintain compliance with regulatory requirements.",
    category: "compliance",
    slug: "certificate-expiry",
    sortOrder: 2,
    audienceRoles: [],
  },

  // Troubleshooting
  {
    title: "I can't access a page",
    body: "Access to pages is role-based. Educators primarily see My Portal and related pages. Directors and coordinators have access to operational pages like Financials, Compliance, and Team management. If you believe you should have access to a page you can't see, contact your administrator or Head Office to review your role permissions.",
    category: "troubleshooting",
    slug: "cant-access-page",
    sortOrder: 1,
    audienceRoles: [],
  },
  {
    title: "How do I report a bug?",
    body: "Use the feedback button in the bottom-right corner of any page to report a bug or suggest an improvement. Include as much detail as possible: what you were doing, what you expected to happen, and what actually happened. Screenshots are very helpful. Alternatively, you can contact Head Office directly.",
    category: "troubleshooting",
    slug: "report-bug",
    sortOrder: 2,
    audienceRoles: [],
  },
  {
    title: "I forgot my password",
    body: "On the login page, click the 'Forgot Password' link. Enter your email address and you'll receive a password reset link. The link expires after a short time for security reasons, so use it promptly. If you don't receive the email, check your spam folder or contact Head Office for assistance.",
    category: "troubleshooting",
    slug: "forgot-password",
    sortOrder: 3,
    audienceRoles: [],
  },
];

// POST /api/knowledge-base/seed — seed FAQ articles (owner only)
export async function POST() {
  const { error } = await requireAuth(["owner"]);
  if (error) return error;

  try {
    const existing = await prisma.knowledgeBaseArticle.count();
    if (existing > 0) {
      return NextResponse.json(
        { message: "Articles already exist", count: existing },
        { status: 200 },
      );
    }

    const created = await prisma.knowledgeBaseArticle.createMany({
      data: seedArticles,
    });

    return NextResponse.json(
      { message: "Seeded successfully", count: created.count },
      { status: 201 },
    );
  } catch (err) {
    console.error("[Knowledge Base Seed POST]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
