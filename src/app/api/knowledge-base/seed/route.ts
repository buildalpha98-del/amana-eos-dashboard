import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
const seedArticles = [
  // ─── Getting Started ────────────────────────────────────────────────
  {
    title: "Your First Day on the Dashboard",
    body: `Welcome to the Amana EOS Dashboard — the central hub for managing your OSHC centre.

When you first log in, you'll land on the **Dashboard** page. Here's what you'll see:

- **Greeting bar** at the top with your name and today's date
- **Quick stats** showing key numbers for your centres
- **Activity feed** with recent updates from your team
- **Info snippets** with important announcements from Head Office

**Where to start:**
1. Visit **My Portal** (in the sidebar) to check your profile is up to date
2. Browse the **sidebar** on the left to explore each section — hover over any icon to see the page name
3. Use the **search bar** (Cmd+K or the search icon) to quickly jump to any page

The sidebar is organised into sections: Home, EOS, Operations, Growth, People, and Admin. Each section groups related pages together so you can find things quickly.

Don't worry about learning everything at once. Start with My Portal and your daily tasks, and you'll pick up the rest as you go.`,
    category: "getting_started",
    slug: "your-first-day",
    sortOrder: 1,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Understanding Your Role",
    body: `Your role in the dashboard determines which pages you can access and what actions you can take. Here's a quick guide:

**Owner / Head Office** — Full access to everything including settings, financials, team management, and all centres.

**Admin** — Access to most pages including staff management, compliance tracking, and reporting. Can manage users and settings.

**Coordinator** — Access to your assigned centre's operations: attendance, checklists, rosters, enquiries, and team. Can view compliance and manage day-to-day centre activities.

**Member (Educator)** — Access to My Portal, your roster, leave requests, timesheets, and assigned to-dos. Can view policies and complete training.

**Marketing** — Access to CRM, enquiries, marketing campaigns, email templates, and conversion tracking.

**Staff** — Basic access to My Portal, personal compliance, and assigned tasks.

If you try to visit a page you don't have access to, you'll be redirected to the dashboard. If you believe your role should include access to a page you can't reach, ask your administrator or Head Office to review your permissions.

You can check your current role in **My Portal** under your profile details.`,
    category: "getting_started",
    slug: "understanding-your-role",
    sortOrder: 2,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Setting Up Your Profile",
    body: `Keeping your profile up to date helps your team and ensures compliance records are accurate.

**To update your profile:**
1. Click **My Portal** in the sidebar
2. You'll see your profile card at the top with your name, role, and photo
3. Click **Edit Profile** to update your details

**What you can manage:**
- **Profile photo** — Upload a clear headshot so your team can recognise you
- **Contact details** — Phone number and emergency contact information
- **Qualifications** — Your teaching or childcare qualifications
- **Compliance certificates** — Upload and track your WWCC, First Aid, CPR, and other required certificates (see the Compliance section below your profile)

**Important:** Make sure your emergency contact details are always current. Your coordinator needs this information in case of an emergency at the centre.

Your compliance certificates will show colour-coded status indicators:
- **Green** — Valid and up to date
- **Amber** — Expiring within 30 days
- **Red** — Expired and needs renewal

You'll receive email reminders before certificates expire, but it's good practice to check My Portal regularly.`,
    category: "getting_started",
    slug: "setting-up-your-profile",
    sortOrder: 3,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Using the Mobile App",
    body: `The Amana EOS Dashboard works on your phone as a Progressive Web App (PWA). This means you can install it like a regular app without going to an app store.

**To install on iPhone:**
1. Open the dashboard URL in Safari
2. Tap the **Share** button (square with an arrow)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add** — the app icon will appear on your home screen

**To install on Android:**
1. Open the dashboard URL in Chrome
2. Tap the three-dot menu in the top right
3. Tap **Add to Home Screen** (or you may see an install banner automatically)
4. Tap **Add**

**Mobile navigation:**
- The sidebar collapses on mobile — tap the menu icon (three lines) in the top left to open it
- Key pages are optimised for mobile with card-based layouts instead of wide tables
- Attendance, menus, and checklists all have mobile-friendly views

**Tips for mobile use:**
- Use the search (Cmd+K or search icon) to quickly jump to pages
- The dashboard works best on a stable Wi-Fi or 4G connection
- If content doesn't load, pull down to refresh or check your internet connection`,
    category: "getting_started",
    slug: "using-the-mobile-app",
    sortOrder: 4,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Keyboard Shortcuts & Quick Actions",
    body: `The dashboard includes shortcuts and quick actions to help you work faster.

**Global search (Cmd+K / Ctrl+K):**
The most useful shortcut. Press Cmd+K (Mac) or Ctrl+K (Windows) to open the search bar. From here you can:
- Search for any page by name and jump straight to it
- Find staff members, services, or records quickly

**Quick Add button:**
Look for the **+ Quick Add** button on the dashboard. This lets you quickly create common items without navigating to their full page:
- New To-Do
- New Issue
- New Rock
- Leave Request

**Notification bell:**
The bell icon in the top bar shows your unread notifications. Click it to see:
- New to-do assignments
- Overdue task reminders
- Compliance alerts
- Rock updates

**Other helpful tips:**
- Click your profile picture in the top right to access account settings or log out
- Use the **breadcrumbs** at the top of each page to navigate back to parent pages
- Most tables support **URL-based filters** — bookmark filtered views to return to them quickly
- The **feedback widget** in the bottom-right corner lets you report issues or suggest improvements from any page`,
    category: "getting_started",
    slug: "keyboard-shortcuts-quick-actions",
    sortOrder: 5,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Getting Help & Reporting Issues",
    body: `If you're stuck or something isn't working, here's how to get help:

**1. Help Centre (this page!)**
Browse articles by category or use the search bar at the top to find answers to common questions. Articles are written for OSHC staff — no technical jargon.

**2. Feedback Widget**
Click the **feedback button** in the bottom-right corner of any page. You can:
- Report a bug — describe what went wrong
- Suggest an improvement — tell us what would make your day easier
- Share general feedback

Include as much detail as you can: what page you were on, what you clicked, and what happened. Screenshots are very helpful.

**3. Support Tickets**
For more complex issues, go to the **Tickets** page in the sidebar under Support. Create a new ticket with:
- A clear title describing the issue
- Steps to reproduce the problem
- Your centre name and any affected staff

Your ticket will be assigned to the right person and you'll be notified when there's an update.

**4. Contact Head Office**
For urgent issues (like being locked out of your account), contact Head Office directly. They can reset passwords, update roles, and resolve access issues.

**Response times:** Bug reports and tickets are typically reviewed within 1 business day. Urgent access issues are handled same-day where possible.`,
    category: "getting_started",
    slug: "getting-help-reporting-issues",
    sortOrder: 6,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },

  // ─── EOS Basics ─────────────────────────────────────────────────────
  {
    title: "What is EOS?",
    body: `EOS stands for **Entrepreneurial Operating System** — it's a set of simple tools and practices that help businesses run more effectively. Amana OSHC uses EOS to keep all centres aligned, accountable, and focused on what matters most.

**The key idea:** Instead of reacting to problems day-to-day, EOS gives your team a structured way to set priorities, track progress, and solve issues before they become crises.

**The main EOS tools you'll use in the dashboard:**

- **Vision (V/TO)** — Your long-term plan: where Amana is heading over the next 1, 3, and 10 years
- **Rocks** — 90-day priorities that keep the team focused on the most important goals each quarter
- **Scorecard** — Weekly numbers (KPIs) that tell you if the business is on track
- **To-Dos** — 7-day action items that come out of your weekly meetings
- **Issues List** — Problems and ideas that need to be discussed and resolved
- **L10 Meetings** — Structured weekly meetings that keep everyone accountable

**Why it matters for OSHC:**
Running a childcare centre involves juggling compliance, staffing, enrolments, quality, and finances — all at once. EOS gives you a framework to manage it all without anything falling through the cracks.

You don't need to be an EOS expert to use the dashboard. Start with your assigned Rocks and To-Dos, and the system will guide you through the rest.`,
    category: "eos_basics",
    slug: "what-is-eos",
    sortOrder: 1,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Rocks: Your 90-Day Priorities",
    body: `Rocks are the 3 to 7 most important goals your team commits to achieving this quarter (90 days). They're called "Rocks" because, like big rocks in a jar, you need to place them first before filling in the smaller stuff.

**How Rocks work in the dashboard:**

1. Go to the **Rocks** page in the EOS section of the sidebar
2. You'll see all current Rocks with their owner, due date, and status
3. Each Rock shows as **On Track** (green), **Off Track** (red), or **Complete** (checked)

**Creating a new Rock:**
- Click **Add Rock** at the top of the page
- Write a clear, specific title (e.g., "Achieve 90% occupancy at Bankstown by end of Q1")
- Assign an owner — one person is accountable for each Rock
- Set the quarter end date as the due date

**Tracking your Rocks:**
- Update your Rock status weekly, ideally before your L10 meeting
- If a Rock is off track, raise it as an Issue so the team can help
- When a Rock is complete, mark it as done and it will move to the completed section

**Tips for good Rocks:**
- Make them specific and measurable — "Improve quality" is too vague; "Achieve Meeting rating in all 7 NQS areas" is clear
- Each Rock should have exactly one owner (even if others help)
- 3-7 Rocks per quarter is the sweet spot — too many means none get done
- Review Rocks every week during your L10 meeting`,
    category: "eos_basics",
    slug: "rocks-90-day-priorities",
    sortOrder: 2,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "The Scorecard: Weekly Measurables",
    body: `The Scorecard is a weekly snapshot of your most important numbers. By tracking the same 5-15 measurables every week, you can spot trends early and catch problems before they become serious.

**How to use the Scorecard:**

1. Go to the **Scorecard** page in the EOS section
2. You'll see a table with measurables as rows and weeks as columns
3. Each measurable has a **target** — the number you're aiming for
4. Green means you hit the target; red means you missed it

**Entering data:**
- Click on any empty cell to enter that week's number
- Data is auto-saved as you type
- On mobile, you'll see the 4 most recent weeks in a card layout

**Common measurables for OSHC centres:**
- Daily attendance / occupancy rate
- Staff-to-child ratio compliance
- Number of enquiries received
- Enrolment conversion rate
- Outstanding compliance items
- Parent satisfaction scores

**Tips:**
- Enter your numbers at the same time each week (e.g., Friday afternoon) for consistency
- If a measurable is consistently off track for 3+ weeks, drop it to the Issues list for discussion
- The Scorecard is reviewed at the start of every L10 meeting
- Don't track too many numbers — focus on the ones that truly matter for your centre's success

Each measurable has an owner who is responsible for keeping it up to date and accountable for hitting the target.`,
    category: "eos_basics",
    slug: "scorecard-weekly-measurables",
    sortOrder: 3,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "To-Dos: Weekly Action Items",
    body: `To-Dos are short, specific tasks that should be completed within 7 days. They usually come from your weekly L10 meeting but can be created anytime.

**Creating a To-Do:**
1. Go to the **To-Dos** page in the EOS section
2. Click **Add To-Do**
3. Write a clear, actionable title (e.g., "Call plumber about Bankstown kitchen tap")
4. Assign it to the right person
5. Set a due date (typically 7 days from now)

**Managing your To-Dos:**
- Your assigned To-Dos also appear in **My Portal** for quick access
- Check off a To-Do when it's complete — it will move to the done list
- If you can't finish a To-Do in 7 days, it rolls forward and should be discussed in the next L10 meeting
- Use the **filter** and **sort** options to focus on what's most urgent

**Creating a To-Do from an Issue:**
When your team solves an Issue during IDS, the solution usually becomes a To-Do. You can create a To-Do directly from the Issues page by clicking the action menu on any issue.

**Tips for effective To-Dos:**
- Start with a verb: "Call...", "Email...", "Order...", "Review..."
- Be specific enough that anyone could understand what "done" looks like
- One owner per To-Do — shared responsibility means no one is accountable
- Aim for a 90%+ completion rate each week

To-Dos are reviewed during every L10 meeting. A simple "done" or "not done" keeps accountability clear and meetings moving.`,
    category: "eos_basics",
    slug: "todos-weekly-action-items",
    sortOrder: 4,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Issues List & IDS",
    body: `The Issues List is where you capture anything that needs team discussion — problems, ideas, opportunities, or concerns. IDS (Identify, Discuss, Solve) is the method you use to work through them.

**Adding an Issue:**
1. Go to the **Issues** page in the EOS section
2. Click **Add Issue**
3. Write a clear title describing the problem or opportunity
4. Optionally add notes with context
5. The issue will be added to the list for discussion at your next L10 meeting

**How IDS works:**
During your L10 meeting, the team prioritises the top 3 issues and works through each one:

1. **Identify** — What's the real issue? Dig past the symptoms to find the root cause. Often the stated issue isn't the real problem.
2. **Discuss** — Everyone shares their perspective. Keep it focused — no tangents or repeating points.
3. **Solve** — Agree on a concrete action. This usually becomes a To-Do assigned to one person.

**Tips:**
- Add issues as they come up during the week — don't wait for the meeting
- Be honest and specific when writing issues
- Not every issue needs IDS — some can be resolved quickly outside the meeting
- The most important issues get discussed first, so prioritise ruthlessly
- AI-powered **Smart Issue Prioritisation** can help rank issues by impact if your team enables it

The Issues List is one of the most powerful EOS tools. It gives your team a safe, structured way to surface problems and actually solve them.`,
    category: "eos_basics",
    slug: "issues-list-ids",
    sortOrder: 5,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "L10 Meetings: Your Weekly Pulse",
    body: `The Level 10 (L10) Meeting is a structured 90-minute weekly meeting that keeps your team aligned, accountable, and solving problems. The goal is for every participant to rate the meeting a "10 out of 10."

**How to run an L10 in the dashboard:**
1. Go to the **Meetings** page in the sidebar
2. Click **Start Meeting** to begin a new L10
3. The meeting follows a set agenda — the dashboard guides you through each section

**The L10 agenda:**

| Section | Time | What happens |
|---------|------|-------------|
| Segue | 5 min | Share personal and professional good news |
| Scorecard | 5 min | Review weekly measurables — flag any off-track numbers |
| Rock Review | 5 min | Quick on/off track status for each Rock |
| Headlines | 5 min | Share customer and employee news (good and bad) |
| To-Do Review | 5 min | "Done" or "not done" for each To-Do |
| IDS | 60 min | Prioritise and solve the top 3 Issues |
| Conclude | 5 min | Recap new To-Dos, rate the meeting, cascading messages |

**Best practices:**
- Start and end on time, every time
- Same day, same time, same agenda every week
- No phones or laptops for side tasks during the meeting
- Be open and honest — the meeting only works if people speak up
- The facilitator keeps the meeting on track and moving forward

**After the meeting:**
All new To-Dos, Issue updates, and Rock status changes are saved in the dashboard automatically. Everyone walks away knowing exactly what they need to do for the next 7 days.`,
    category: "eos_basics",
    slug: "l10-meetings-weekly-pulse",
    sortOrder: 6,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },

  // ─── HR & Leave ─────────────────────────────────────────────────────
  {
    title: "Submitting a Leave Request",
    body: `When you need time off, submit your leave request through the dashboard so your coordinator can plan coverage.

**Step by step:**
1. Go to **My Portal** or the **Leave** page in the People section of the sidebar
2. Click **Request Leave**
3. Fill in the form:
   - **Leave type** — Annual leave, personal/carer's leave, unpaid leave, etc.
   - **Start date** — The first day you'll be away
   - **End date** — The last day you'll be away
   - **Notes** — Any additional context (optional but helpful)
4. Click **Submit**

**What happens next:**
- Your request is sent to your coordinator or manager for approval
- You'll receive a notification when it's approved or declined
- Approved leave appears on your roster and the centre's leave calendar

**Tips:**
- Submit leave requests as early as possible — at least 2 weeks in advance for planned leave
- For sick leave, submit the request as soon as you can, even if it's on the day
- Check the leave calendar before requesting dates to avoid clashing with other team members
- Your leave balance is visible in My Portal

If you need to cancel an approved leave request, contact your coordinator directly.`,
    category: "hr",
    slug: "submitting-leave-request",
    sortOrder: 1,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Viewing Your Roster & Shifts",
    body: `Your roster shows you when and where you're working each week.

**Finding your roster:**
1. Go to **My Portal** — your upcoming shifts are displayed in the schedule section
2. Or visit the **Services** page, select your centre, and go to the **Roster** tab to see the full team roster

**What you'll see:**
- Your shift times (start and end) for each day
- The centre/service you're assigned to
- Any notes from your coordinator about the shift

**Roster details:**
- Rosters are managed by your coordinator and imported from the rostering system
- Changes to your roster will be reflected in the dashboard after the next sync
- If you notice an error in your roster, contact your coordinator directly

**Tips:**
- Check your roster at the start of each week so you're prepared
- If you need to swap a shift, arrange it with a colleague and let your coordinator know
- Roster changes made after the schedule is published will trigger a notification

**On mobile:**
The roster displays in a card layout that's easy to read on your phone. Each day shows as a separate card with your shift details.`,
    category: "hr",
    slug: "viewing-roster-shifts",
    sortOrder: 2,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Timesheets: Logging Your Hours",
    body: `Timesheets help ensure you're paid correctly for the hours you work.

**How timesheets work:**
1. Go to the **Timesheets** page in the People section of the sidebar
2. You'll see your shifts and hours for the current pay period
3. Shifts are imported from your roster by your coordinator

**Reviewing your timesheet:**
- Check that your shift start and end times match what you actually worked
- Look for any missing shifts or incorrect hours
- If something doesn't look right, raise it with your coordinator before the submission deadline

**For coordinators — importing timesheets:**
1. Go to the **Timesheets** page
2. Click **Import** to upload roster data from OWNA
3. Review the imported shifts for accuracy
4. Approve timesheets before the payroll deadline

**Important notes:**
- Timesheets are based on rostered shifts — if you worked extra hours or swapped shifts, make sure your coordinator has updated the roster
- Check your timesheet weekly rather than waiting until pay day
- Any discrepancies should be raised promptly

If you have questions about pay or hours, speak with your coordinator first. They can review and adjust timesheet records as needed.`,
    category: "hr",
    slug: "timesheets-logging-hours",
    sortOrder: 3,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Staff Compliance: Certificates & Checks",
    body: `All OSHC staff must maintain valid compliance certificates. The dashboard tracks these for you and sends reminders before they expire.

**Required certificates for educators:**
- **Working with Children Check (WWCC)** — Mandatory for all staff
- **First Aid** — Current first aid certificate
- **CPR** — Renewed annually
- **Anaphylaxis Management** — Training certificate
- **Asthma Management** — Training certificate
- **Child Protection** — Required training

**Additional certificates (role-dependent):**
- GECCKO certificate
- Food Safety / Food Handler certification
- Diploma or Certificate III qualifications

**Checking your compliance status:**
1. Go to **My Portal**
2. Scroll to the **Compliance** section
3. Each certificate shows its expiry date and status:
   - **Green** — Valid (more than 30 days until expiry)
   - **Amber** — Expiring soon (within 30 days)
   - **Red** — Expired

**Uploading a new certificate:**
1. In My Portal, find the certificate type in your compliance section
2. Click to upload the new document
3. Enter the new expiry date
4. The system will update your status automatically

**Automatic reminders:**
You'll receive email alerts at 30 days and 7 days before any certificate expires. Don't ignore these — expired certificates affect your centre's compliance rating and may mean you can't work until renewed.`,
    category: "hr",
    slug: "staff-compliance-certificates",
    sortOrder: 4,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Staff Directory",
    body: `The Staff Directory helps you find contact details and information about your colleagues across all Amana centres.

**Accessing the directory:**
1. Go to the **Staff Directory** page in the People section of the sidebar
2. You'll see a list of all active staff members

**What you can see:**
- Name and profile photo
- Role and position
- Assigned centre(s)
- Contact details (email, phone)

**Searching and filtering:**
- Use the **search bar** to find someone by name
- Filter by **centre/service** to see who works at a specific location
- Filter by **role** to find coordinators, educators, or admin staff

**When to use the directory:**
- Need to contact a colleague at another centre
- Looking for the coordinator or responsible person at a specific service
- Checking who's on the team at a centre you're covering

**Privacy note:**
The directory shows professional contact details only. Personal phone numbers and addresses are not displayed. If you need to reach someone urgently and can't find their details, contact your coordinator or Head Office.

The directory is available to coordinators, members, admins, Head Office, and owners. Staff in educator roles can access it through My Portal.`,
    category: "hr",
    slug: "staff-directory",
    sortOrder: 5,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Staff Onboarding & Training",
    body: `New staff go through an onboarding process managed through the dashboard, and ongoing training is tracked to ensure everyone stays qualified and up to date.

**For new staff:**
When you first join Amana, your coordinator will set you up in the system. You'll receive:
- Login credentials for the dashboard
- An onboarding checklist in My Portal with tasks to complete
- Training modules assigned to your profile

**Onboarding checklist:**
Your onboarding checklist may include:
- Upload compliance certificates (WWCC, First Aid, CPR, etc.)
- Complete orientation training modules
- Read and acknowledge key policies
- Set up your profile with photo and emergency contacts
- Meet your team and familiarise yourself with the centre

**Ongoing training:**
- Training modules are available through the dashboard
- Your coordinator assigns courses relevant to your role
- Track your progress in **My Portal** under the training section
- Completed training is logged against your profile

**For coordinators managing onboarding:**
1. Add the new staff member to the system (or they'll be created via staff sync)
2. Assign their centre and role
3. The system will generate onboarding tasks automatically
4. Monitor their progress through the staff lifecycle page

**Retention check-ins:**
The system automatically creates check-in reminders at 1, 3, 6, and 12 months for new staff. Coordinators receive these as To-Dos to ensure new team members are settling in well.`,
    category: "hr",
    slug: "staff-onboarding-training",
    sortOrder: 6,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },

  // ─── Compliance ─────────────────────────────────────────────────────
  {
    title: "Understanding NQS & Compliance",
    body: `The National Quality Standard (NQS) is the benchmark that all OSHC services in Australia are assessed against. The dashboard helps you track and improve your compliance across all quality areas.

**The 7 NQS Quality Areas:**
1. **Educational program and practice**
2. **Children's health and safety**
3. **Physical environment**
4. **Staffing arrangements**
5. **Relationships with children**
6. **Collaborative partnerships with families and communities**
7. **Governance and leadership**

**How the dashboard helps:**
- **QIP (Quality Improvement Plan)** — Track improvement goals for each quality area under the Services section
- **Compliance tracking** — Monitor certificates, ratios, and checklist completion
- **Audit templates** — Run regular self-assessments against NQS standards
- **Automated alerts** — Get notified when compliance items need attention

**Rating levels:**
Services are rated as Significant Improvement Required, Working Towards, Meeting, Exceeding, or Excellent. Your goal is to achieve "Meeting" or higher in all 7 areas.

**What you can do:**
- Review your centre's QIP regularly and update progress on improvement actions
- Complete daily checklists thoroughly — they feed into compliance tracking
- Keep your personal certificates current
- Report any compliance concerns to your coordinator immediately

Compliance isn't just about passing assessments — it's about providing the best possible care for children every day.`,
    category: "compliance",
    slug: "understanding-nqs-compliance",
    sortOrder: 1,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Staff-to-Child Ratios",
    body: `Maintaining correct staff-to-child ratios is a legal requirement and one of the most important compliance areas in OSHC. The dashboard helps track ratios in real time.

**Legal ratio requirements:**
- The specific ratios depend on your state and the ages of children in care
- Generally, OSHC services must maintain a minimum ratio of qualified educators to children
- At least 50% of educators should hold (or be working towards) a diploma-level qualification

**How the dashboard tracks ratios:**
- The **Attendance** tab in your service page shows current numbers
- The system cross-references attendance with rostered staff
- **Alerts** are triggered if ratios fall below the required minimum
- The **Scorecard** can include ratio compliance as a weekly measurable

**What to do if ratios are at risk:**
1. Check the attendance numbers and staffing for the day
2. Contact your coordinator immediately if you're short-staffed
3. Arrange for additional staff or adjust group sizes
4. Log any ratio breaches as incidents

**VIC qualification check:**
For Victorian centres, the system automatically flags sessions where less than 50% of rostered educators hold a diploma-level qualification.

**Tips:**
- Update attendance records promptly — accurate numbers are essential for ratio tracking
- Plan ahead for staff absences — check leave requests against daily staffing needs
- Ratio compliance is checked during regulatory visits, so keeping accurate records protects your centre`,
    category: "compliance",
    slug: "staff-to-child-ratios",
    sortOrder: 2,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Daily Checklists",
    body: `Daily checklists ensure that important safety and operational tasks are completed every day at your centre. They're managed through the dashboard and tracked for compliance.

**Types of checklists:**
- **Morning open** — Tasks to complete before children arrive (safety checks, environment setup, sign-in sheets ready)
- **Evening close** — End-of-day tasks (cleaning, securing the centre, checking all children have been collected)
- **Safety walks** — Regular walk-throughs to check for hazards
- **Custom checklists** — Your coordinator may set up additional checklists specific to your centre

**Completing a checklist:**
1. Go to your **Service** page and select the **Checklists** tab
2. Find today's checklist
3. Work through each item, ticking it off as you complete it
4. Add notes where required (e.g., if something needs follow-up)
5. Your progress is saved automatically

**Mark All Complete:**
If you've completed all items, use the **Mark All Complete** button to check everything off at once. Only use this if you've genuinely verified every item.

**Why checklists matter:**
- They ensure nothing gets missed in the daily routine
- Completed checklists are evidence of compliance during audits
- They help new staff learn what needs to be done each day
- Patterns in missed items can highlight areas for improvement

**For coordinators:**
Checklist completion rates are tracked and can be reviewed in the service overview. If items are consistently incomplete, address it with your team.`,
    category: "compliance",
    slug: "daily-checklists",
    sortOrder: 3,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Incident Reporting",
    body: `All incidents at your centre must be reported promptly and accurately. The dashboard provides a structured way to log, track, and manage incidents.

**What counts as an incident:**
- Child injury (however minor)
- Medical emergency
- Missing or unaccounted-for child
- Property damage
- Staff injury
- Behavioural incidents
- Complaints from parents or community members
- Any event that could affect safety

**How to report an incident:**
1. Go to the **Incidents** page in the Operations section
2. Click **Report Incident**
3. Fill in the details:
   - Date, time, and location
   - People involved
   - Description of what happened
   - Action taken
   - Witnesses
4. Submit the report

**After reporting:**
- The incident is logged and visible to your coordinator and management
- Serious incidents may require notification to regulatory authorities
- Follow-up actions will be assigned as needed
- The incident can be reviewed and updated as more information becomes available

**Incident dashboard:**
The Incidents page shows an overview of all incidents with:
- Stats and trends over time
- Flagged centres with high incident rates
- Distribution by type
- Status tracking (open, investigating, resolved)

**Important:** Report incidents as soon as possible while details are fresh. Accurate reporting protects the children, staff, and the organisation. Never delay reporting an incident.`,
    category: "compliance",
    slug: "incident-reporting",
    sortOrder: 4,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Policies & Acknowledgements",
    body: `Amana maintains policies that all staff must read and acknowledge. The dashboard tracks which policies you've read and alerts you when policies are updated.

**Viewing policies:**
1. Go to the **Policies** page in the Operations section of the sidebar
2. Browse the list of current policies
3. Click on any policy to read it in full

**Acknowledging a policy:**
When you read a policy, you'll see an **Acknowledge** button. Clicking this confirms that you've read and understood the policy. Your acknowledgement is recorded with your name and the date.

**When policies are updated:**
- Policies may be updated from time to time as regulations or procedures change
- When a policy is updated to a new version, your previous acknowledgement is cleared
- You'll be notified that a policy needs re-acknowledgement
- Read the updated policy and acknowledge the new version

**Policy tracking for managers:**
Coordinators and administrators can see:
- Which staff have acknowledged each policy
- Who still needs to read updated policies
- Compliance rates across the team
- Policy version history

**Why this matters:**
- Reading and understanding policies is a regulatory requirement
- Acknowledgements are evidence of compliance during audits
- Policies exist to protect children, staff, and the organisation
- Staying up to date ensures you're following current best practices

If you have questions about a policy, speak with your coordinator or raise it in your next team meeting.`,
    category: "compliance",
    slug: "policies-acknowledgements",
    sortOrder: 5,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Audit Templates & QIP",
    body: `Audits and Quality Improvement Plans (QIPs) help your centre maintain and improve the quality of care. The dashboard provides tools to manage both.

**Audit templates:**
1. Go to your **Service** page and select the **Audits** tab
2. You'll see available audit templates (e.g., monthly safety audit, NQS self-assessment)
3. Click on a template to start an audit
4. Work through each question, recording your observations
5. Submit the completed audit

**Types of audits:**
- **Safety audits** — Regular checks of the physical environment
- **NQS self-assessments** — Review performance against each of the 7 quality areas
- **Program quality reviews** — Assess educational programs and documentation
- **Custom audits** — Set up by your coordinator for specific needs

**Quality Improvement Plan (QIP):**
The QIP is your centre's plan for ongoing improvement. In the dashboard:
1. Go to your **Service** page and select the **QIP** tab
2. View current improvement goals organised by NQS quality area
3. Each goal has an action plan, responsible person, and timeline
4. Update progress as improvements are made

**AI-powered QIP suggestions:**
If enabled, the AI assistant can generate NQS-aligned improvement actions based on your centre's data. This helps identify areas for focus and suggests concrete steps.

**Tips:**
- Schedule regular audits (e.g., monthly) rather than waiting for compliance visits
- Use audit findings to update your QIP
- Celebrate improvements — acknowledging progress motivates the team
- Keep evidence of improvements (photos, updated procedures, training records) linked to QIP items`,
    category: "compliance",
    slug: "audit-templates-qip",
    sortOrder: 6,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },

  // ─── Operations ─────────────────────────────────────────────────────
  {
    title: "Managing Your Service/Centre",
    body: `Each OSHC centre (called a "service" in the dashboard) has a detailed page with everything you need to manage day-to-day operations.

**Finding your service:**
1. Go to the **Services** page in the Operations section
2. You'll see all centres displayed as swim-lane cards with key info
3. Click on a service to open its detail page
4. Use search and filters to find specific centres

**The service detail page:**
Your service page is organised into 6 tabbed sections, each with sub-tabs:

- **Today** — Quick overview of today's attendance, staff on duty, and key numbers
- **EOS** — Rocks, To-Dos, Issues, and Scorecard specific to this centre
- **Operations** — Attendance, menu plans, programs, and holiday quests
- **Compliance** — Checklists, audits, QIP, and communication logs
- **Finance** — Budget tracking and financial reports
- **Team** — Staff roster, contacts, and team information

**Navigation tips:**
- Use the tab pills at the top to switch between sections
- Sub-tabs appear below the main tabs for more detailed views
- Your current tab and sub-tab are saved in the URL — bookmark specific views for quick access
- The **Today** panel gives you a snapshot without having to navigate through all tabs

**For coordinators:**
You'll spend most of your time in the Operations and Compliance tabs. Set up your daily routine to check attendance, complete checklists, and review any flagged items each morning.`,
    category: "operations",
    slug: "managing-your-service",
    sortOrder: 1,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Attendance Tracking",
    body: `Accurate attendance records are essential for compliance, funding, and day-to-day operations. The dashboard provides tools to record and manage attendance at each centre.

**Recording attendance:**
1. Go to your **Service** page and select the **Attendance** tab under Operations
2. You'll see the attendance grid for the current week
3. Two types of bookings are tracked:
   - **Permanent** — Regular ongoing bookings (previously called "Enrolled")
   - **Casual Bookings** — One-off or irregular attendances (previously called "Estimated")

**How to use the attendance view:**
- The grid shows days across the top and attendance categories down the side
- Enter numbers for each day
- Totals are calculated automatically
- On mobile, attendance shows as a card per day for easier viewing

**Propagating bookings:**
For permanent bookings that repeat each week:
1. Enter the bookings for the current week
2. Click **Propagate** to copy these numbers to future weeks
3. This saves time and ensures consistent record-keeping

**Why attendance matters:**
- Required for government funding (CCS) calculations
- Essential for maintaining correct staff-to-child ratios
- Helps with planning staffing and resources
- Used in financial reporting and forecasting

**Tips:**
- Update attendance daily, not at the end of the week
- Double-check numbers against your sign-in sheets
- If attendance patterns change, update permanent bookings and re-propagate
- Attendance data feeds into the Scorecard and financial reports automatically`,
    category: "operations",
    slug: "attendance-tracking",
    sortOrder: 2,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Managing Enquiries & Enrolments",
    body: `The dashboard tracks the full journey from a family's first enquiry through to a completed enrolment.

**Enquiry flow:**
1. A new enquiry comes in (phone, email, website, or walk-in)
2. It's logged on the **Enquiries** page in the Growth section
3. The enquiry moves through stages: New → Info Sent → Nurturing → Form Started → First Session → Enrolled
4. At each stage, automated nurture emails can be sent to keep families engaged

**Logging a new enquiry:**
1. Go to the **Enquiries** page
2. Click **Add Enquiry**
3. Enter the family's details: parent name, email, phone, child's name and age, preferred service
4. Set the initial stage (usually "New")
5. Save — the system will begin the nurture sequence automatically

**Enrolment process:**
When a family is ready to enrol:
1. Move the enquiry to the "Form Started" stage
2. The family completes the enrolment form
3. Review the submitted form on the enrolment detail page
4. Process the enrolment — this activates the child's record in the system

**CRM and lead tracking:**
For more detailed lead management, use the **CRM** page. This provides:
- A kanban board view of all leads by stage
- Lead scoring (AI-powered, 0-100) to prioritise follow-ups
- Automated outreach sequences triggered by stage changes

**Conversion tracking:**
The **Conversions** page shows a visual funnel of how many enquiries convert at each stage, helping you identify where families drop off and focus your efforts.`,
    category: "operations",
    slug: "managing-enquiries-enrolments",
    sortOrder: 3,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Email & Communication",
    body: `The dashboard includes tools for sending professional emails to families, staff, and other contacts.

**Sending emails:**
1. Go to the **Marketing** page in the Growth section
2. Click **Compose Email** to open the email composer
3. Choose your recipients
4. Select a template or write from scratch
5. Preview your email and send

**Email composer features:**
- **Block editor** — Build emails visually with text, images, buttons, and dividers
- **HTML editor** — Switch to raw HTML for precise control
- **Live preview** — See exactly what recipients will see
- **Templates** — Load from saved templates for consistent branding
- **Header/footer customisation** — Adjust colours, logo, and footer text

**Email templates:**
- Go to the **Templates** sub-tab on the Marketing page
- Browse default templates for common communications (welcome emails, reminders, updates)
- Create your own templates using the block editor
- Templates can be linked to automated sequences

**Automated sequences:**
The **Sequences** tab lets you set up automatic email series:
- Nurture sequences for enquiring families
- Onboarding sequences for new enrolments
- CRM outreach sequences for leads
- Each sequence has timed steps that send automatically

**Communication logs:**
All emails sent through the dashboard are logged. You can view send history and delivery status on the Marketing Analytics tab, including open rates and daily volume.

**Tips:**
- Always preview emails before sending
- Use templates for consistency across centres
- Check the analytics tab to see which emails are performing well`,
    category: "operations",
    slug: "email-communication",
    sortOrder: 4,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Financial Reports",
    body: `The Financials page gives you visibility into the financial health of each centre and the organisation as a whole.

**Accessing financials:**
1. Go to the **Financials** page in the Operations section
2. Select your centre or view organisation-wide data
3. Choose the time period (weekly is the default)

**What you'll see:**
- **Revenue** — Income from fees, CCS, and other sources
- **Expenses** — Staffing costs, supplies, rent, and other outgoings
- **Gross profit and margin** — How much you're making after costs
- **Health scores** — Colour-coded indicators of financial performance

**Data sources:**
Financial data comes from multiple sources, indicated by badges:
- **AUTO** — Automatically calculated by the system
- **OWNA** — Imported from the OWNA childcare management system
- **Xero** — Synced from Xero accounting software
- **Pencil icon** — Manually entered data

**Time periods:**
- **Weekly** — The default view, generated automatically each week
- **Monthly** — Aggregated from weekly data, available from the 1st of each month
- **Quarterly** — Broader trends for strategic planning

**Health scores:**
Each centre receives health scores based on financial performance. These feed into the service overview and board reports, making it easy to spot centres that need attention.

**Tips:**
- Review financials weekly during your L10 meeting
- If weekly data shows concerning trends, don't wait for the monthly rollup to take action
- Financial data feeds into scenarios and board reports automatically
- The AI demand forecasting tool can predict trends based on historical data`,
    category: "operations",
    slug: "financial-reports",
    sortOrder: 5,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "The Queue: Automated Reports",
    body: `The Queue is where automated reports and tasks land when they need human review. Think of it as your inbox for system-generated items that require attention.

**Accessing the Queue:**
1. Go to the **Queue** page in the sidebar
2. By default, you see **My Queue** — items assigned to you
3. Admins can toggle to **All Queues** to see everything across the team

**What appears in the Queue:**
- Automated compliance reports
- Checklist audit summaries
- Communication digests
- Program quality reviews
- Any report generated by the automation system (Cowork)

**Working through a Queue item:**
1. Click on a report to open the **Report Viewer** slide-over panel
2. Read through the report content (formatted with headings, lists, and highlights)
3. If the report includes a **checklist**, tick off action items as you complete them (progress is saved automatically)
4. Review any **alerts** (flagged items that need attention) and **metrics** (key numbers)
5. Mark the item as complete when you've addressed everything

**Exporting reports:**
Click the **Export PDF** button in the Report Viewer to generate a branded Amana OSHC PDF. This is useful for filing, sharing with stakeholders, or printing for records.

**Filtering the Queue:**
- Filter by **service/centre** to focus on specific locations
- Filter by **status** to see pending, in progress, or completed items
- Filter by **report type** to find specific kinds of reports

**Tips:**
- Check your Queue daily — items pile up if left unattended
- Use the checklist feature to track follow-up actions without creating separate To-Dos
- Completed Queue items stay in the system for audit purposes`,
    category: "operations",
    slug: "queue-automated-reports",
    sortOrder: 6,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },

  // ─── Troubleshooting ────────────────────────────────────────────────
  {
    title: "Can't Access a Page?",
    body: `If you're trying to reach a page and keep getting redirected to the dashboard, it's most likely a role permissions issue.

**Why it happens:**
Access to pages is controlled by your assigned role. Each role has a specific set of pages it can access:
- **Educators/Staff** — My Portal, leave, timesheets, and assigned tasks
- **Coordinators** — Centre operations, attendance, compliance, and team management
- **Admin/Head Office/Owner** — Full access to all pages including financials, settings, and reporting

**What to do:**
1. Check your role in **My Portal** (look for your role label under your name)
2. If your role seems wrong, contact your coordinator or Head Office
3. They can update your role in the **Team** or **Settings** page

**Common access issues:**
- **New staff** — Your account may not have been given the right role yet. Ask your coordinator to check.
- **Changed responsibilities** — If you've taken on new duties, your role may need updating.
- **Marketing role** — This role is specifically for marketing tasks. If you need broader access, ask for a role change.

**If you're completely locked out:**
- Try logging out and back in
- Clear your browser cache and cookies
- If you still can't log in, contact Head Office to reset your account

Remember: role restrictions exist to keep data secure and ensure people only see what's relevant to their work.`,
    category: "troubleshooting",
    slug: "cant-access-page",
    sortOrder: 1,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Data Not Loading?",
    body: `If a page is showing a loading spinner that won't go away, or data appears to be missing, try these steps:

**Quick fixes:**
1. **Refresh the page** — Press Cmd+R (Mac) or Ctrl+R (Windows), or pull down on mobile
2. **Check your internet connection** — Open another website to confirm you're online
3. **Clear your browser cache** — Go to your browser settings and clear cached data
4. **Try a different browser** — If the issue persists, try Chrome, Safari, or Firefox

**If data still won't load:**
- **Check if it's just one page** — If other pages work fine, the issue may be specific to that section. Report it via the feedback widget.
- **Check the time** — Some data (like financials) updates on a schedule. Weekly data is generated each week, and monthly data on the 1st of each month.
- **Check your filters** — Make sure you haven't applied a filter that excludes all results. Clear all filters and try again.

**On mobile:**
- Make sure you have a strong Wi-Fi or 4G connection
- Close and reopen the app
- If you installed it as a PWA, try accessing it through the browser instead

**If nothing works:**
1. Note which page isn't loading and what you see (error message, blank screen, spinner)
2. Report it through the **feedback widget** or create a **support ticket**
3. Include: the page URL, your browser, and what you were trying to do

Most loading issues are temporary and resolve with a simple refresh. If you see an actual error message, include it in your report — it helps us fix the problem faster.`,
    category: "troubleshooting",
    slug: "data-not-loading",
    sortOrder: 2,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Email Not Sending?",
    body: `If you're trying to send an email through the dashboard and it's not working, here are some things to check:

**Before sending:**
- Make sure you've selected at least one recipient
- Check that the email has a subject line and body content
- Preview the email to confirm it looks correct
- If using a template, make sure the template has been saved properly

**If the send button isn't responding:**
- Check your internet connection
- Try refreshing the page and composing the email again
- Make sure you haven't accidentally sent it already — check the delivery log

**If emails aren't being received:**
- Ask the recipient to check their **spam/junk folder**
- Verify the recipient's email address is correct
- Check the **Marketing Analytics** tab to see if the email shows as "delivered" in the system
- Some email providers may delay delivery — wait 5-10 minutes

**For automated sequences:**
If nurture or outreach emails aren't sending:
- Check that the sequence is **active** (not paused)
- Verify the contact has an email address on file
- Check the sequence step timing — emails are sent by a scheduled cron job
- Look at the **Active Sequences** view to see the status and next send date

**If issues persist:**
Contact Head Office or create a support ticket. Include:
- Who you were trying to email
- When you tried to send
- Any error messages you saw

The email system uses Resend for delivery, and the team can check delivery logs to diagnose issues.`,
    category: "troubleshooting",
    slug: "email-not-sending",
    sortOrder: 3,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
  {
    title: "Something Looks Wrong?",
    body: `If you notice something on the dashboard that doesn't look right — incorrect data, a broken layout, an unexpected error, or something that just seems off — here's how to report it effectively.

**Step 1: Take note of the details**
Before reporting, gather this information:
- **Which page** you were on (copy the URL if possible)
- **What you expected** to see or happen
- **What actually happened** — describe it clearly
- **When it happened** — date and time
- **Your browser** — Chrome, Safari, Firefox, etc.
- **Device** — Desktop or mobile

**Step 2: Take a screenshot**
A screenshot is worth a thousand words. On Mac, press Cmd+Shift+4 to capture a selection. On Windows, press Win+Shift+S.

**Step 3: Report it**
You have three options:

1. **Feedback widget** (quickest) — Click the feedback button in the bottom-right corner of any page. Select "Bug Report" and paste your details.

2. **Support ticket** (for complex issues) — Go to the **Tickets** page and create a new ticket. This is best for issues that need back-and-forth investigation.

3. **Tell your coordinator** — For urgent issues that affect daily operations, let your coordinator know directly so they can escalate.

**What happens next:**
- Bug reports are reviewed by the team, usually within 1 business day
- You may be asked for more details
- Once fixed, you'll be notified (if you submitted a ticket)

**Common things that look wrong but aren't:**
- **Empty pages** — You may not have data yet for that section. Check if you need to seed or import data first.
- **Different numbers than expected** — Financial data may show weekly vs monthly. Check the period selector.
- **Missing menu items** — Your role may not have access. See the "Can't Access a Page?" article.`,
    category: "troubleshooting",
    slug: "something-looks-wrong",
    sortOrder: 4,
    audienceRoles: [],
    videoUrl: null, // Optional: set a Loom/YouTube embed URL for this article
  },
];

// POST /api/knowledge-base/seed — seed knowledge base articles (owner only)
export const POST = withApiAuth(async (req, session) => {
  try {
    const existing = await prisma.knowledgeBaseArticle.count();
    if (existing > 0) {
      return NextResponse.json(
        { message: "Articles already exist — delete existing articles first to re-seed", count: existing },
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
    logger.error("Knowledge Base Seed POST", { err });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}, { roles: ["owner"] });
