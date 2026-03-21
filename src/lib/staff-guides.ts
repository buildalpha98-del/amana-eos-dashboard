// ---------------------------------------------------------------------------
// Role-specific quick-start guide content
// ---------------------------------------------------------------------------

export interface GuideStep {
  text: string;
  bold?: string; // optional bold prefix
}

export interface GuideSection {
  title: string;
  icon: string; // emoji for print-friendly display
  steps: GuideStep[];
}

export interface GuideContent {
  role: string;
  displayName: string;
  welcome: string;
  sections: GuideSection[];
}

// ---------------------------------------------------------------------------
// Shared tips & sections
// ---------------------------------------------------------------------------

const quickTipsBase: GuideStep[] = [
  { bold: "\u2318K", text: "to search anything instantly" },
  { bold: "?", text: "for keyboard shortcuts" },
  { bold: "Star", text: "your most-used pages in the sidebar for quick access" },
  { bold: "Install as app", text: "on your phone (PWA) for mobile access" },
];

const quickTipsCoordinator: GuideStep[] = [
  ...quickTipsBase,
  { bold: "All Queues", text: "view to see cross-centre tasks" },
  { bold: "Export CSVs", text: "from any table for reporting" },
];

// ---------------------------------------------------------------------------
// Staff / Educator Guide
// ---------------------------------------------------------------------------

const staffGuide: GuideContent = {
  role: "staff",
  displayName: "Educator",
  welcome:
    "Welcome to the Amana OSHC Dashboard \u2014 your daily hub for tasks, rosters, and compliance.",
  sections: [
    {
      title: "Your Daily Routine",
      icon: "\u2600\ufe0f",
      steps: [
        { text: "Check your dashboard for today\u2019s todos" },
        { text: "View your roster for the week" },
        { text: "Record attendance for your session" },
        { text: "Complete daily checklists (morning/evening)" },
      ],
    },
    {
      title: "Logging Incidents",
      icon: "\u26a0\ufe0f",
      steps: [
        { text: "Use Quick Add (+) in the top bar and select Log Incident" },
        { text: "Fill in the required details: child, type, description, witnesses, and actions taken" },
        { text: "Your coordinator and centre director will be notified automatically" },
      ],
    },
    {
      title: "Compliance",
      icon: "\ud83d\udee1\ufe0f",
      steps: [
        { text: "Keep your certificates up to date via My Portal" },
        { text: "Acknowledge new policies when prompted on your dashboard" },
        { text: "Upload renewed certificates before expiry to stay compliant" },
      ],
    },
    {
      title: "Quick Tips",
      icon: "\ud83d\udca1",
      steps: quickTipsBase,
    },
    {
      title: "Getting Help",
      icon: "\u2753",
      steps: [
        { text: "Visit the Help Centre from the sidebar for FAQs and guides" },
        { text: "Contact your coordinator for operational questions" },
        { text: "Use the Feedback Widget (bottom-right) to report issues" },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Member / Centre Director Guide
// ---------------------------------------------------------------------------

const memberGuide: GuideContent = {
  role: "member",
  displayName: "Centre Director",
  welcome:
    "As a Centre Director, you manage your centre\u2019s operations, team, and EOS rhythm.",
  sections: [
    {
      title: "Your Morning Routine",
      icon: "\u2600\ufe0f",
      steps: [
        { text: "Check dashboard stats for today\u2019s snapshot" },
        { text: "Review today\u2019s attendance numbers and ratios" },
        { text: "Check for overdue todos and address blockers" },
        { text: "Review any incidents reported yesterday" },
      ],
    },
    {
      title: "Weekly L10 Meeting",
      icon: "\ud83d\udcc5",
      steps: [
        { bold: "Prepare", text: "your scorecard numbers, rock updates, and new issues" },
        { bold: "Run the meeting", text: "from the Meetings page \u2014 follow the L10 agenda" },
        { bold: "IDS process", text: "for issues: Identify the root cause, Discuss solutions, Solve with a to-do" },
        { text: "Create todos directly from issues to track follow-through" },
      ],
    },
    {
      title: "Managing Your Centre",
      icon: "\ud83c\udfe2",
      steps: [
        { bold: "Service detail page", text: "has 6 tab groups: Today, EOS, Programs, Operations, Compliance, and Comms" },
        { text: "Update the scorecard weekly with your measurables" },
        { text: "Manage rocks quarterly \u2014 set, track progress, and mark on/off track" },
        { text: "Oversee daily checklists and print them for staff if needed" },
      ],
    },
    {
      title: "Team Management",
      icon: "\ud83d\udc65",
      steps: [
        { text: "View your team roster and upcoming shifts" },
        { text: "Approve or flag leave requests" },
        { text: "Monitor compliance certificates and expiry dates" },
      ],
    },
    {
      title: "EOS Concepts",
      icon: "\ud83d\udcda",
      steps: [
        { bold: "Rocks", text: "\u2014 your 3\u20137 most important 90-day priorities" },
        { bold: "Scorecard", text: "\u2014 5\u201315 weekly measurables that tell you if the business is on track" },
        { bold: "IDS", text: "\u2014 Identify, Discuss, Solve \u2014 the process for resolving issues" },
        { bold: "L10", text: "\u2014 Level 10 Meeting \u2014 a structured weekly meeting format" },
        { bold: "V/TO", text: "\u2014 Vision/Traction Organizer \u2014 your company\u2019s strategic plan on two pages" },
      ],
    },
    {
      title: "Quick Tips",
      icon: "\ud83d\udca1",
      steps: [
        ...quickTipsBase,
        { bold: "Centre Switcher", text: "in the header to jump between your centres" },
        { bold: "Bulk actions", text: "on todos and issues to save time" },
        { bold: "Print checklists", text: "for staff from the service Operations tab" },
        { bold: "Command Palette", text: "(\u2318K) for lightning-fast navigation" },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Coordinator / Service Coordinator Guide
// ---------------------------------------------------------------------------

const coordinatorGuide: GuideContent = {
  role: "coordinator",
  displayName: "Service Coordinator",
  welcome:
    "You oversee multiple centres \u2014 the dashboard helps you stay across everything.",
  sections: [
    {
      title: "Multi-Centre Management",
      icon: "\ud83c\udf10",
      steps: [
        { text: "Use the Centre Switcher dropdown to move between centres" },
        { text: "Compare centre performance via the Performance page" },
        { text: "Use the Queue system for cross-centre tasks and reports" },
      ],
    },
    {
      title: "Daily Operations",
      icon: "\ud83d\udcca",
      steps: [
        { text: "Monitor attendance across all your centres" },
        { text: "Check ratio monitoring and flag shift gaps" },
        { text: "Review incident reports and follow up on action items" },
      ],
    },
    {
      title: "EOS Rhythm",
      icon: "\ud83c\udfaf",
      steps: [
        { text: "Review scorecards weekly for each centre" },
        { text: "Track rock progress across centres quarterly" },
        { text: "Prepare for L10 meetings with cross-centre data" },
      ],
    },
    {
      title: "Compliance Oversight",
      icon: "\ud83d\udee1\ufe0f",
      steps: [
        { text: "Track certificate expiry across your team" },
        { text: "Schedule and review audits for each centre" },
        { text: "Monitor policy compliance rates" },
      ],
    },
    {
      title: "People",
      icon: "\ud83d\udc65",
      steps: [
        { text: "Use the Staff Directory to find and connect with team members" },
        { text: "Monitor onboarding progress for new starters" },
        { text: "Manage leave requests and approve timesheets" },
      ],
    },
    {
      title: "Quick Tips",
      icon: "\ud83d\udca1",
      steps: quickTipsCoordinator,
    },
  ],
};

// ---------------------------------------------------------------------------
// Admin Guide
// ---------------------------------------------------------------------------

const adminGuide: GuideContent = {
  role: "admin",
  displayName: "Admin",
  welcome:
    "As an Admin, you have broad access to manage operations, people, and system configuration.",
  sections: [
    // Include coordinator sections
    ...coordinatorGuide.sections.filter((s) => s.title !== "Quick Tips"),
    {
      title: "System Administration",
      icon: "\u2699\ufe0f",
      steps: [
        { text: "Manage users \u2014 invite new staff, assign roles, deactivate leavers" },
        { text: "Configure API keys for external integrations" },
        { text: "Review and update system settings" },
      ],
    },
    {
      title: "Monitoring",
      icon: "\ud83d\udd0d",
      steps: [
        { text: "Check the Audit Log for security and activity tracking" },
        { text: "Monitor system health via the dashboard" },
        { text: "Track staff onboarding progress across all centres" },
      ],
    },
    {
      title: "Reporting",
      icon: "\ud83d\udcc8",
      steps: [
        { text: "Generate Board Reports for stakeholder updates" },
        { text: "Use the Data Room for due diligence documents" },
        { text: "Run Scenarios for financial projections and what-if modelling" },
      ],
    },
    {
      title: "Quick Tips",
      icon: "\ud83d\udca1",
      steps: quickTipsCoordinator,
    },
  ],
};

// ---------------------------------------------------------------------------
// Head Office / State Manager Guide
// ---------------------------------------------------------------------------

const headOfficeGuide: GuideContent = {
  role: "head_office",
  displayName: "State Manager",
  welcome:
    "Your dashboard gives you a bird\u2019s eye view across all centres in your state.",
  sections: [
    {
      title: "Strategic Overview",
      icon: "\ud83c\udfaf",
      steps: [
        { text: "Check the Centre Performance widget on your dashboard" },
        { text: "Compare health scores across centres" },
        { text: "Review the financial overview for revenue and margin trends" },
      ],
    },
    {
      title: "Operations",
      icon: "\ud83c\udfe2",
      steps: [
        { text: "Monitor cross-centre compliance and certificate status" },
        { text: "Review incident trends and flagged centres" },
        { text: "Track staffing alerts and ratio gaps" },
      ],
    },
    {
      title: "EOS & Strategy",
      icon: "\ud83d\udcda",
      steps: [
        { text: "Review the Vision/Traction Organizer (V/TO) for strategic alignment" },
        { text: "Track quarterly rocks across all centres" },
        { text: "Prepare and review Board Reports" },
      ],
    },
    {
      title: "People",
      icon: "\ud83d\udc65",
      steps: [
        { text: "Monitor the recruitment pipeline and open vacancies" },
        { text: "Review staff pulse survey results" },
        { text: "Track retention metrics and milestone check-ins" },
      ],
    },
    {
      title: "Quick Tips",
      icon: "\ud83d\udca1",
      steps: quickTipsCoordinator,
    },
  ],
};

// ---------------------------------------------------------------------------
// Marketing Coordinator Guide
// ---------------------------------------------------------------------------

const marketingGuide: GuideContent = {
  role: "marketing",
  displayName: "Marketing Coordinator",
  welcome:
    "Track enquiries, manage campaigns, and grow enrolments from your dashboard.",
  sections: [
    {
      title: "Enquiry Pipeline",
      icon: "\ud83d\udce5",
      steps: [
        { text: "Manage incoming enquiries on the Enquiries page" },
        { text: "Send welcome emails with edit-before-send workflow" },
        { text: "Move enquiries through stages: Info Sent \u2192 Nurturing \u2192 Form Started \u2192 Enrolled" },
      ],
    },
    {
      title: "CRM & Leads",
      icon: "\ud83c\udfaf",
      steps: [
        { text: "Track leads through the sales pipeline on the CRM page" },
        { text: "Review AI lead scores to prioritise follow-ups" },
        { text: "Set up nurture sequences to automate outreach" },
      ],
    },
    {
      title: "Marketing Tools",
      icon: "\ud83d\udce7",
      steps: [
        { text: "Use the Email Composer to build branded emails with the block editor" },
        { text: "Manage campaigns \u2014 transactional for small sends, Brevo for large" },
        { text: "Browse and customise the template library" },
      ],
    },
    {
      title: "Reporting",
      icon: "\ud83d\udcca",
      steps: [
        { text: "Track conversion rates on the Conversions page" },
        { text: "Review email analytics \u2014 open rates, send volume, and engagement" },
        { text: "Use the Marketing Dashboard for campaign performance overview" },
      ],
    },
    {
      title: "Quick Tips",
      icon: "\ud83d\udca1",
      steps: quickTipsBase,
    },
  ],
};

// ---------------------------------------------------------------------------
// Owner Guide
// ---------------------------------------------------------------------------

const ownerGuide: GuideContent = {
  role: "owner",
  displayName: "Owner",
  welcome:
    "Full visibility into every aspect of your OSHC network \u2014 from daily operations to long-term strategy.",
  sections: [
    {
      title: "EOS Leadership",
      icon: "\ud83c\udfc6",
      steps: [
        { text: "Set the vision using the Vision/Traction Organizer (V/TO)" },
        { text: "Lead quarterly planning \u2014 set company and department rocks" },
        { text: "Run effective L10 meetings: segue, scorecard, rock review, to-do review, IDS, conclude" },
        { text: "Model the EOS process for your leadership team" },
      ],
    },
    {
      title: "Business Intelligence",
      icon: "\ud83d\udcca",
      steps: [
        { text: "Review centre performance on the Performance page" },
        { text: "Run financial Scenarios for growth planning and what-if modelling" },
        { text: "Prepare Board Reports with one click from the dashboard" },
        { text: "Use the Data Room to track due diligence readiness" },
      ],
    },
    // Include key sections from other guides
    {
      title: "Operations Overview",
      icon: "\ud83c\udfe2",
      steps: [
        { text: "Monitor all centres via the Centre Switcher" },
        { text: "Review health scores and compliance across the network" },
        { text: "Track incidents, audits, and policy compliance" },
        { text: "Oversee financials \u2014 revenue, margins, and CCS subsidy data" },
      ],
    },
    {
      title: "People & Growth",
      icon: "\ud83d\udc65",
      steps: [
        { text: "Manage the full team \u2014 users, roles, and permissions from Settings" },
        { text: "Track recruitment pipeline and staff retention" },
        { text: "Monitor enquiry-to-enrolment conversion funnel" },
        { text: "Review marketing campaign performance and email analytics" },
      ],
    },
    {
      title: "System Administration",
      icon: "\u2699\ufe0f",
      steps: [
        { text: "Manage API keys and external integrations" },
        { text: "Review the Audit Log for security oversight" },
        { text: "Configure organisation settings and permissions" },
        { text: "Manage Xero integration for payroll and finances" },
      ],
    },
    {
      title: "Quick Tips",
      icon: "\ud83d\udca1",
      steps: [
        ...quickTipsCoordinator,
        { bold: "Board Reports", text: "page generates a comprehensive monthly report automatically" },
        { bold: "AI Assistant", text: "can answer questions about your dashboard data" },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Exported guide map
// ---------------------------------------------------------------------------

export const staffGuides: Record<string, GuideContent> = {
  staff: staffGuide,
  member: memberGuide,
  coordinator: coordinatorGuide,
  admin: adminGuide,
  head_office: headOfficeGuide,
  marketing: marketingGuide,
  owner: ownerGuide,
};

/** All available role keys for the role selector */
export const guideRoleKeys = Object.keys(staffGuides);
