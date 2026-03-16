"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Star,
  Compass,
  Building2,
  Users,
  ClipboardList,
  Clock,
  BookOpen,
  Eye,
  Shield,
  UserCheck,
  Stethoscope,
  FileText,
  PenLine,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
} from "lucide-react";

/* ─── Section data ──────────────────────────────────────────────────── */

interface Section {
  id: string;
  label: string;
  icon: React.ReactNode;
  tag: string;
  title: string;
  subtitle: string;
}

const SECTIONS: Section[] = [
  { id: "welcome", label: "Welcome", icon: <Star className="w-4 h-4" />, tag: "Getting Started", title: "Welcome to Amana OSHC", subtitle: "Your journey starts here" },
  { id: "identity", label: "Our Identity & Values", icon: <Compass className="w-4 h-4" />, tag: "Who We Are", title: "Our Identity & Values", subtitle: "IHSAN values, philosophy and guiding principles" },
  { id: "what-we-do", label: "What We Do & Clubs", icon: <Building2 className="w-4 h-4" />, tag: "Who We Are", title: "What We Do & Club Names", subtitle: "The four types of care we offer and our signature program clubs" },
  { id: "roles", label: "Roles & Responsibilities", icon: <Users className="w-4 h-4" />, tag: "Your Role", title: "Roles & Responsibilities", subtitle: "Understanding the team structure, your role and key expectations" },
  { id: "first-day", label: "Getting Started", icon: <ClipboardList className="w-4 h-4" />, tag: "Getting Started", title: "Getting Started", subtitle: "Your first day checklist, uniform, compliance, rosters and payroll" },
  { id: "daily", label: "Daily Operations 1-9", icon: <Clock className="w-4 h-4" />, tag: "Every Day", title: "Daily Operations", subtitle: "Step-by-step guides for all 9 daily operations" },
  { id: "mtop", label: "MTOP Framework", icon: <BookOpen className="w-4 h-4" />, tag: "Every Day", title: "MTOP Framework", subtitle: "My Time, Our Place - the 5 Learning Outcomes for School Age Care" },
  { id: "supervision", label: "Supervision & Ratios", icon: <Eye className="w-4 h-4" />, tag: "Safety", title: "Supervision & Ratios", subtitle: "Active supervision using the CLEAR model and regulatory ratios" },
  { id: "childprotection", label: "Child Safe Standards", icon: <Shield className="w-4 h-4" />, tag: "Safety", title: "Child Safe Standards", subtitle: "Child Protection, Mandatory Reporting and recognising indicators of abuse" },
  { id: "collection", label: "Collection & Non-Arrival", icon: <UserCheck className="w-4 h-4" />, tag: "Safety", title: "Collection & Non-Arrival", subtitle: "Late/non-arrival procedures and authorisation to collect children" },
  { id: "medical", label: "Medical & Incidents", icon: <Stethoscope className="w-4 h-4" />, tag: "Safety", title: "Medical & Incidents", subtitle: "Medical conditions, medication, injuries and reportable incidents" },
  { id: "policies", label: "All Policies", icon: <FileText className="w-4 h-4" />, tag: "Policies", title: "All Policies - Quick Reference", subtitle: "A simplified summary of all 14 Amana OSHC policies" },
  { id: "acknowledgement", label: "Acknowledgement", icon: <PenLine className="w-4 h-4" />, tag: "Sign Off", title: "Educator Acknowledgement", subtitle: "Confirm you have read and understood the handbook" },
];

/* ─── Alert component ───────────────────────────────────────────────── */

function Alert({ type, children }: { type: "info" | "warning" | "danger" | "success"; children: React.ReactNode }) {
  const styles = {
    info: "bg-sky-50 border-l-4 border-sky-500 text-sky-900",
    warning: "bg-amber-50 border-l-4 border-amber-500 text-amber-900",
    danger: "bg-red-50 border-l-4 border-red-500 text-red-900",
    success: "bg-emerald-50 border-l-4 border-emerald-500 text-emerald-900",
  };
  const icons = {
    info: <Info className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />,
    danger: <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />,
    success: <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />,
  };
  return (
    <div className={`rounded-lg p-3 my-3 flex items-start gap-2.5 text-sm ${styles[type]}`}>
      {icons[type]}
      <div>{children}</div>
    </div>
  );
}

/* ─── Step list component ───────────────────────────────────────────── */

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2 my-3">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3 bg-amber-50/60 border border-amber-100 rounded-lg p-3 text-sm">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white flex items-center justify-center text-xs font-bold">{i + 1}</span>
          <span dangerouslySetInnerHTML={{ __html: step }} />
        </li>
      ))}
    </ol>
  );
}

/* ─── Checklist component ───────────────────────────────────────────── */

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 my-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm py-1.5 border-b border-gray-100 last:border-b-0">
          <CheckCircle2 className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
          <span dangerouslySetInnerHTML={{ __html: item }} />
        </li>
      ))}
    </ul>
  );
}

/* ─── Content block ─────────────────────────────────────────────────── */

function ContentBlock({ title, ownaPath, children }: { title: string; ownaPath?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-6 mb-5 shadow-sm">
      {ownaPath && (
        <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2 flex items-center gap-1.5">
          <span className="bg-brand text-white px-1.5 py-0.5 rounded text-[9px] font-bold">OWNA</span>
          {ownaPath}
        </div>
      )}
      <h2 className="text-base font-bold text-brand mb-4 pb-2.5 border-b-2 border-brand-yellow">{title}</h2>
      {children}
    </div>
  );
}

/* ─── Accordion ─────────────────────────────────────────────────────── */

function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg mb-2 overflow-hidden">
      <button onClick={() => setOpen(!open)} className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-brand hover:bg-gray-50 ${open ? "bg-sky-50 border-b" : ""}`}>
        {title}
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && <div className="p-4 text-sm">{children}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SECTION RENDERERS
   ═══════════════════════════════════════════════════════════════════════ */

function WelcomeSection() {
  return (
    <>
      <ContentBlock title="Welcome to The Amana Way">
        <p className="text-sm text-gray-600 mb-3">This interactive handbook is your go-to guide for everything you need to know as an Amana OSHC Educator. From daily operations to child protection, compliance, and our unique values - it&apos;s all here.</p>
        <p className="text-sm text-gray-600">Use the sidebar to navigate between sections. You can also search for any topic using the search bar above.</p>
      </ContentBlock>
    </>
  );
}

function IdentitySection() {
  return (
    <>
      <ContentBlock title="IHSAN Values">
        <p className="text-sm text-gray-600 mb-4">Every Amana OSHC educator is expected to embody <strong>IHSAN</strong> - striving for excellence and sincerity in all that we do.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-brand text-white"><th className="p-2.5 text-left">Letter</th><th className="p-2.5 text-left">Value</th><th className="p-2.5 text-left">What It Means</th></tr></thead>
            <tbody className="divide-y">
              <tr><td className="p-2.5 font-bold text-brand-yellow text-lg">I</td><td className="p-2.5 font-semibold">Inspire</td><td className="p-2.5 text-gray-600">Spark curiosity, creativity and Islamic identity in every child</td></tr>
              <tr><td className="p-2.5 font-bold text-brand-yellow text-lg">H</td><td className="p-2.5 font-semibold">Honour</td><td className="p-2.5 text-gray-600">Respect every culture, faith, family dynamic and individual</td></tr>
              <tr><td className="p-2.5 font-bold text-brand-yellow text-lg">S</td><td className="p-2.5 font-semibold">Safeguard</td><td className="p-2.5 text-gray-600">Uphold child-safe, physically and emotionally secure environments</td></tr>
              <tr><td className="p-2.5 font-bold text-brand-yellow text-lg">A</td><td className="p-2.5 font-semibold">Aspire</td><td className="p-2.5 text-gray-600">Pursue continuous growth, professional development and reflection</td></tr>
              <tr><td className="p-2.5 font-bold text-brand-yellow text-lg">N</td><td className="p-2.5 font-semibold">Nurture</td><td className="p-2.5 text-gray-600">Safe ratios, proactive behaviour guidance, emotional coaching</td></tr>
            </tbody>
          </table>
        </div>
      </ContentBlock>

      <ContentBlock title="Our Philosophy">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: "👦", t: "Children Are Capable & Confident Learners", d: "We view each child as a competent and successful learner filled with curiosity and unique strengths." },
            { icon: "🤝", t: "Equity, Inclusion & Diversity Are Fundamental", d: "We embrace the principles of equity and inclusion, ensuring every child feels valued and respected." },
            { icon: "🪃", t: "Aboriginal & Torres Strait Islander Cultures Are Honoured", d: "We deeply value Australia's First Nations cultures and embed these perspectives into our daily culture." },
            { icon: "👨‍👩‍👧", t: "Families Are Key Partners", d: "We foster strong relationships with families, inviting their collaboration and involvement." },
            { icon: "✅", t: "Best Practice In Education & Care", d: "Our educators provide high-quality care that reflects best practices and promotes learning through play." },
          ].map((p) => (
            <div key={p.t} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="font-semibold text-brand text-sm mb-1">{p.icon} {p.t}</div>
              <p className="text-xs text-gray-500">{p.d}</p>
            </div>
          ))}
        </div>
      </ContentBlock>

      <ContentBlock title="Amana OSHC Principles">
        <p className="text-sm text-gray-600 mb-4">In addition to IHSAN, everyone contributes to these three principles:</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { emoji: "😄", t: "Fun", d: "Every child, family, educator or member of the school community should walk into the service and have fun.", color: "border-brand-yellow" },
            { emoji: "💡", t: "Engaging", d: "Do children and families want to be at the service? Are we creating experiences worth coming back for?", color: "border-teal-500" },
            { emoji: "🌟", t: "Presentation", d: "What do families see and feel when they enter a service or interact with Amana OSHC?", color: "border-brand" },
          ].map((p) => (
            <div key={p.t} className={`border-t-4 ${p.color} rounded-lg border border-gray-200 p-4 text-center`}>
              <div className="text-2xl mb-2">{p.emoji}</div>
              <div className="font-bold text-brand text-sm mb-1">{p.t}</div>
              <p className="text-xs text-gray-500">{p.d}</p>
            </div>
          ))}
        </div>
      </ContentBlock>
    </>
  );
}

function WhatWeDoSection() {
  return (
    <>
      <ContentBlock title="Types of Care We Offer">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: "☀️", t: "Before & After School Care", d: "Before school: 6:30 am - 9:00 am\nAfter school: 3:00 pm - 6:30 pm", color: "border-l-brand" },
            { icon: "🏖️", t: "Holiday Programs", d: "Full day of care - Excursion Days, Incursion Days and In-House Days during school holidays.", color: "border-l-brand-yellow" },
            { icon: "📅", t: "Pupil Free Days", d: "Full day of care provided during the school term on pupil-free days.", color: "border-l-teal-500" },
          ].map((c) => (
            <div key={c.t} className={`border-l-4 ${c.color} rounded-lg border border-gray-200 p-4`}>
              <div className="font-bold text-brand text-sm mb-2">{c.icon} {c.t}</div>
              <p className="text-xs text-gray-500 whitespace-pre-line">{c.d}</p>
            </div>
          ))}
        </div>
      </ContentBlock>

      <ContentBlock title="Our Club Names">
        <p className="text-sm text-gray-600 mb-3">Amana OSHC runs a variety of signature clubs designed to develop different strengths in children.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-surface"><th className="p-2.5 text-left font-semibold">Club Name</th><th className="p-2.5 text-left font-semibold">Focus</th></tr></thead>
            <tbody className="divide-y">
              {[
                ["Rise + Shine Club", "Start the day with breakfast, quiet spaces and light activities"],
                ["Iqra Circle", "Nurture learning Qur'an, Tajweed, reflection and living by Islamic values"],
                ["Little Champions Club", "Build strength and skills through sports and active play"],
                ["Fuel Up with Amana", "Enjoy wholesome meals and snacks inspired by the Sunnah"],
                ["Amana Afternoons", "After-school meals, activities and quiet reflection rooted in Islamic values"],
                ["Homework Heroes", "Dedicated time to complete homework and get assistance"],
                ["Imagination Station", "Engage in STEM projects, arts and crafts"],
                ["Holiday Quest", "School holiday adventures with themed activities, projects and excursions"],
              ].map(([name, focus]) => (
                <tr key={name}><td className="p-2.5 font-semibold text-brand">{name}</td><td className="p-2.5 text-gray-600">{focus}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </ContentBlock>
    </>
  );
}

function RolesSection() {
  return (
    <>
      <ContentBlock title="Team Structure">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-brand text-white rounded-lg p-4">
            <div className="text-xs font-bold tracking-wider text-brand-yellow uppercase mb-2">Area Manager</div>
            <ul className="text-xs space-y-1 list-disc pl-4 opacity-90"><li>Manages current regions</li><li>Ensures safety & compliance</li><li>Reports to OSHC Director</li></ul>
          </div>
          <div className="bg-teal-700 text-white rounded-lg p-4">
            <div className="text-xs font-bold tracking-wider text-brand-yellow uppercase mb-2">Coordinator / Centre Director</div>
            <ul className="text-xs space-y-1 list-disc pl-4 opacity-90"><li>Experience in childcare or OSHC</li><li>Educational Leader of the program</li><li>Reports to Area Manager</li></ul>
          </div>
          <div className="bg-gray-50 border-2 border-teal-500 rounded-lg p-4">
            <div className="text-xs font-bold tracking-wider text-teal-600 uppercase mb-2">2IC Educators</div>
            <ul className="text-xs space-y-1 list-disc pl-4 text-gray-600"><li>Second in Charge at larger services</li><li>Supports Coordinator with administration</li><li>Working towards becoming a Coordinator</li></ul>
          </div>
          <div className="bg-amber-50 border-2 border-brand-yellow rounded-lg p-4">
            <div className="text-xs font-bold tracking-wider text-brand uppercase mb-2">Educators &larr; You!</div>
            <ul className="text-xs space-y-1 list-disc pl-4 text-gray-600"><li>Make up the largest part of the team</li><li>Priority is engaging with the children</li><li>Helps to run the program</li></ul>
          </div>
        </div>
      </ContentBlock>

      <ContentBlock title="The Role of an Amana OSHC Educator">
        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-600 mt-4 mb-2">Purpose</h3>
        <Checklist items={[
          "Support children's wellbeing, learning and development through high-quality, play-based programs",
          "Work collaboratively under the direction of the OSHC Coordinator / Educational Leader to deliver safe, inclusive and engaging care",
        ]} />
        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-600 mt-4 mb-2">Core Responsibilities</h3>
        <Checklist items={[
          "Build positive, respectful relationships with children, families, and colleagues",
          "Implement the My Time Our Place (MTOP) framework in daily practice",
          "Assist with planning, delivering and evaluating educational and leisure experiences",
          "Uphold child-safe standards and mandatory reporting requirements",
          "Maintain confidentiality, professionalism and compliance with all Amana OSHC policies",
        ]} />
      </ContentBlock>

      <ContentBlock title="Key Focus Areas & Expectations">
        {[
          { n: "1", t: "Educational Program & Practice", d: "Create inspiring play-based environments that extend children's learning, document progress and reflect on outcomes.", c: "border-l-brand-yellow" },
          { n: "2", t: "Children's Health & Safety", d: "Ensure constant supervision, safe ratios, first-aid readiness, hygiene, and adherence to food-safety and child-protection procedures.", c: "border-l-teal-500" },
          { n: "3", t: "Physical Environment", d: "Maintain safe, stimulating and sustainable indoor/outdoor areas; report hazards and equipment issues promptly.", c: "border-l-brand" },
          { n: "4", t: "Professional Conduct & Teamwork", d: "Model ethical behaviour, follow the ECA Code of Ethics, participate in meetings, and contribute to continuous improvement.", c: "border-l-brand-yellow" },
          { n: "5", t: "Relationships & Community", d: "Promote inclusion, cultural safety and partnerships with families and local communities.", c: "border-l-teal-500" },
        ].map((f) => (
          <div key={f.n} className={`border-l-4 ${f.c} border border-gray-200 rounded-lg p-4 mb-2`}>
            <div className="font-semibold text-brand text-sm mb-1">{f.n}. {f.t}</div>
            <p className="text-xs text-gray-500">{f.d}</p>
          </div>
        ))}
      </ContentBlock>
    </>
  );
}

function FirstDaySection() {
  return (
    <>
      <ContentBlock title="Your First Day - Things to Remember">
        <p className="text-sm text-gray-600 mb-3"><strong>Prior to your first shift:</strong></p>
        <Checklist items={[
          "Read the service-specific guide book",
          "Know where the school is that your shift is at",
          "Know where the service is located within the school",
          "Research parking / public transport options",
          "Save the service phone number to your phone",
          "Log into OWNA and have your PIN code ready to sign in on service iPad",
          "Email/print out your staff records to present to the service area manager",
          "Have your full uniform ready to go",
        ]} />
      </ContentBlock>

      <ContentBlock title="Staff Uniform">
        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-600 mb-2">What You Are Provided</h3>
        <Checklist items={["1 x T-Shirt", "1 x Zip-Up Jacket", "1 x Bucket Hat (must be worn in Terms 1 & 4)", "1 x Lanyard and ID tag"]} />
        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-600 mt-4 mb-2">Acceptable Work Attire</h3>
        <Checklist items={[
          "3/4 or full length trousers or pants",
          "Leggings/Activewear must be thick material that does not go see-through when stretched",
          "Skirts/shorts must come to knee length",
          "Closed toe shoes only - appropriate for actively engaging in high energy activities",
          "Full Amana OSHC uniform at all times",
        ]} />
      </ContentBlock>

      <ContentBlock title="Educator Compliance">
        <p className="text-sm text-gray-600 mb-3">All compliance is managed through <strong>OWNA</strong>. Amana OSHC mandates all educators hold:</p>
        <Checklist items={[
          "Employee Working with Children Check",
          "Copy of completed Qualification OR evidence of enrolment (dated within the last 3 months)",
          "HLTAID012 - First Aid in an Educational Care Setting",
          "Child Protection Training (completed through RTO)",
        ]} />
        <Alert type="info"><strong>Questions?</strong> Email operations@amanaoshc.com.au</Alert>
      </ContentBlock>

      <ContentBlock title="Essential Training & Qualifications">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-surface"><th className="p-2 text-left">Code</th><th className="p-2 text-left">Course</th><th className="p-2 text-left">Cost</th><th className="p-2 text-left">Who</th></tr></thead>
            <tbody className="divide-y text-gray-600">
              <tr><td className="p-2 font-semibold">CHCPRT025</td><td className="p-2">Identify & Report Children at Risk</td><td className="p-2">$119</td><td className="p-2">All</td></tr>
              <tr><td className="p-2 font-semibold">HLTAID009</td><td className="p-2">CPR (renew yearly)</td><td className="p-2">$45</td><td className="p-2">All</td></tr>
              <tr><td className="p-2 font-semibold">HLTAID012</td><td className="p-2">First Aid in Education & Care (3 years)</td><td className="p-2">$115</td><td className="p-2">All</td></tr>
              <tr><td className="p-2 font-semibold">SITXFSA005</td><td className="p-2">Use Hygienic Practices for Food Safety</td><td className="p-2">$35</td><td className="p-2">All</td></tr>
              <tr><td className="p-2 font-semibold">SITXFSA006</td><td className="p-2">Safe Food Handling Practice (Supervisor)</td><td className="p-2">$99</td><td className="p-2">2IC+</td></tr>
            </tbody>
          </table>
        </div>
        <Alert type="success"><strong>Amana covers 50%</strong> of the cost for all listed educator courses.</Alert>
      </ContentBlock>

      <ContentBlock title="Rosters">
        <p className="text-sm text-gray-600 mb-3">Rosters are published through <strong>OWNA</strong>. Most rosters are published <strong>1 week in advance</strong>.</p>
        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-600 mb-2">Cancelling a Shift</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-surface"><th className="p-2 text-left">Shift Type</th><th className="p-2 text-left">Notify By</th></tr></thead>
            <tbody className="divide-y text-gray-600">
              <tr><td className="p-2">Before School Care (BSC)</td><td className="p-2">2:30 pm the day before</td></tr>
              <tr><td className="p-2">After School Care (ASC)</td><td className="p-2">10:00 am the day of</td></tr>
              <tr><td className="p-2">Holiday Program Shifts</td><td className="p-2">2:30 pm the day before</td></tr>
            </tbody>
          </table>
        </div>
      </ContentBlock>

      <ContentBlock title="Payroll">
        <Checklist items={[
          "Payroll is processed <strong>fortnightly on a Wednesday</strong>",
          "Payslips are emailed to your personal email the same day",
          "Payroll queries or changes: accounts@amanaoshc.com.au",
        ]} />
      </ContentBlock>
    </>
  );
}

function DailyOpsSection() {
  return (
    <>
      <ContentBlock title="Daily Routine Overview">
        <div className="space-y-3">
          {[
            { time: "2:30 PM", t: "Arrival & Preparation", d: "Arrive, sign in on OWNA, set up areas, brief with team, complete Opening Checklist" },
            { time: "3:10 PM", t: "Collection & Safe Arrivals", d: "Collect children from classrooms/meeting points, sign in via OWNA iPad" },
            { time: "3:20 PM", t: "Group Connection", d: "Short meeting: Acknowledge Country, outline daily program, reinforce safety expectations" },
            { time: "3:25 PM", t: "Program Commences", d: "Activities begin with clear supervision zones; take approved photos; upload OWNA post" },
            { time: "4:00 PM", t: "Snack / Meal Time", d: "Serve food per daily menu; safe food handling (gloves and tongs)" },
            { time: "4-6 PM", t: "Ongoing Program & Family Interaction", d: "Active supervision across all zones; greet parents warmly; assist sign-out" },
            { time: "5:00 PM", t: "Daily Reflection", d: "Complete daily reflection and update notes for next day's planning" },
            { time: "6:00 PM", t: "Close & Pack-Down", d: "Clean, sanitise, store resources; confirm all children signed out; debrief" },
          ].map((item) => (
            <div key={item.time} className="flex items-start gap-3">
              <span className="flex-shrink-0 bg-brand text-brand-yellow text-[11px] font-bold px-2 py-1 rounded mt-0.5 min-w-[60px] text-center">{item.time}</span>
              <div>
                <div className="text-sm font-semibold text-brand">{item.t}</div>
                <p className="text-xs text-gray-500">{item.d}</p>
              </div>
            </div>
          ))}
        </div>
      </ContentBlock>

      {/* Operations 1-9 as accordions */}
      <ContentBlock title="Operations 1-9 (Detailed Guides)">
        <Accordion title="1. Arrival, Setup & Team Briefing">
          <StepList steps={[
            "<strong>Arrive by 2:30 PM</strong>, sign in on OWNA (Centre Check-In &rarr; enter PIN &rarr; OK), greet the team, and check supervision zones and menu.",
            "<strong>Complete Opening Checklist</strong>, set up activity areas, prepare food, ensure hygiene and safety.",
            "<strong>Hold a team briefing</strong> reviewing daily menu, activities, alerts and roles; log meeting notes on OWNA.",
          ]} />
          <Alert type="info"><strong>Expectation:</strong> All educators must contribute ideas, clarify supervision responsibilities and ensure readiness before children arrive.</Alert>
        </Accordion>

        <Accordion title="2. Child Collection & Safe Arrival">
          <StepList steps={[
            "Set up the pick-up point flag outside the service location.",
            "Collect children safely from classrooms or meeting points and greet them warmly.",
            "<strong>Sign in each child immediately</strong> on OWNA iPad: Actions &rarr; Attendances &rarr; tap child name &rarr; OK.",
            "Cross-check attendance; <strong>report any discrepancies to the Coordinator immediately</strong>.",
          ]} />
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 my-2">
            <strong>Attendance Colours:</strong> 🟠 Not signed in | 🟢 Signed In | 🔵 Signed Out | 🔴 Not Attending
          </div>
        </Accordion>

        <Accordion title="3. Group Connection & Acknowledgement of Country">
          <StepList steps={[
            "Gather children calmly and ensure everyone is present.",
            "Deliver <strong>Acknowledgement of Country</strong> respectfully with child participation.",
            "Outline the daily program and expectations; log this short meeting in OWNA.",
          ]} />
        </Accordion>

        <Accordion title="4. Activity Time & Parent Communication Posts">
          <StepList steps={[
            "Engage and supervise children in activities, extending learning through questioning and encouragement.",
            "Take approved photos avoiding clear faces, ensuring they demonstrate learning or teamwork.",
            "Write a fun daily post on activities and follow the OWNA steps to upload, linking activities to MTOP outcomes; share to WhatsApp group.",
          ]} />
        </Accordion>

        <Accordion title="5. Food Service & Hygiene">
          <StepList steps={[
            "Prepare and serve food following hygiene protocols and the daily menu.",
            "Supervise and encourage healthy habits; check allergies and dietary notes.",
            "Record food handling and menu completion in OWNA checklists.",
            "Allow children to serve themselves or others with tongs or gloves.",
          ]} />
        </Accordion>

        <Accordion title="6. Family Interactions & Sign Out">
          <StepList steps={[
            "Welcome families warmly and share positive updates about their child's day.",
            "Assist parents in signing out via iPad, ensuring correct time and PIN.",
            "Confirm children have all belongings before departure and maintain supervision until transfer of care.",
          ]} />
        </Accordion>

        <Accordion title="7. Daily Reflection">
          <StepList steps={[
            "Reflect individually and with the team on what worked and what can improve.",
            "Analyse how activities supported MTOP outcomes and children's learning.",
            "Write a critical reflection linking to MTOP and upload to OWNA - tag all children and provide insights for the next session.",
          ]} />
        </Accordion>

        <Accordion title="8. Pack-Down & Closing Checklist">
          <StepList steps={[
            "Clean, sanitise and safely store all resources.",
            "Confirm all children are signed out; ensure the environment is secured.",
            "Complete closing checklist and log any maintenance issues in OWNA.",
          ]} />
        </Accordion>

        <Accordion title="9. Communication & Escalation Process">
          <StepList steps={[
            "Record parent feedback, incidents or requests in person immediately.",
            "Notify Coordinator of any behaviour, injury or safety concern without delay.",
            "Document follow-up or resolutions within 24 hours.",
          ]} />
          <h3 className="text-xs font-bold uppercase tracking-wider text-teal-600 mt-4 mb-2">Creating an Incident Report in OWNA</h3>
          <StepList steps={[
            "Press the menu icon in the top left corner",
            "Select a child to go to their profile",
            "Open the child profile menu (circle/ellipsis icon)",
            'Select "Create Incident Report"',
            "Upload photos/attachments and tag the child",
            "Complete all fields; collect required signatures (staff + witness + Responsible Person)",
            "Remove the Draft tag when ready to publish - parents will be notified",
            "Press the save/publish icon in the top right corner",
          ]} />
        </Accordion>
      </ContentBlock>
    </>
  );
}

function MTOPSection() {
  const outcomes = [
    { n: "01", t: "Sense of Identity", c: "bg-blue-600", d: "Feel safe, secure and supported; develop autonomy and resilience; build knowledgeable, confident self-identities" },
    { n: "02", t: "Connected to Their World", c: "bg-green-600", d: "Develop sense of belonging; understand reciprocal rights; respond to diversity with respect" },
    { n: "03", t: "Strong Sense of Wellbeing", c: "bg-pink-600", d: "Become strong in social and emotional wellbeing; take increasing responsibility for health" },
    { n: "04", t: "Confident & Involved Learners", c: "bg-orange-500", d: "Develop curiosity, creativity and confidence; use a range of skills and processes" },
    { n: "05", t: "Effective Communicators", c: "bg-brand-yellow text-brand", d: "Interact verbally and non-verbally; engage with texts; collaborate, express ideas" },
  ];
  return (
    <ContentBlock title="5 Learning Outcomes">
      <p className="text-sm text-gray-600 mb-4">The <strong>My Time, Our Place (MTOP)</strong> Framework is the national framework for school-age care. All programs and reflections must link to these 5 outcomes.</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        {outcomes.map((o) => (
          <div key={o.n} className={`${o.c} rounded-lg p-3 text-center text-white`}>
            <div className="text-xl font-black mb-1">{o.n}</div>
            <div className="text-[11px] font-semibold leading-tight">{o.t}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="bg-surface"><th className="p-2 text-left">#</th><th className="p-2 text-left">Outcome</th><th className="p-2 text-left">Key Learning Behaviours</th></tr></thead>
          <tbody className="divide-y text-gray-600">
            {outcomes.map((o) => (
              <tr key={o.n}><td className="p-2 font-bold">{o.n}</td><td className="p-2 font-semibold text-brand">{o.t}</td><td className="p-2">{o.d}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </ContentBlock>
  );
}

function SupervisionSection() {
  return (
    <>
      <ContentBlock title="The CLEAR Supervision Model">
        <p className="text-sm text-gray-600 mb-4">Active supervision is a proactive approach to ensure all children are always safe.</p>
        <div className="grid grid-cols-5 gap-2 mb-4">
          {[
            { l: "C", t: "Count", d: "Headcounts every 30 minutes" },
            { l: "L", t: "Line of Sight", d: "Unobstructed view of all children" },
            { l: "E", t: "Engage", d: "Actively listen and participate" },
            { l: "A", t: "Awareness", d: "Constantly scan for risks" },
            { l: "R", t: "Response", d: "Ready to act immediately" },
          ].map((c) => (
            <div key={c.l} className="bg-brand rounded-lg p-3 text-center text-white">
              <div className="text-2xl font-black text-brand-yellow">{c.l}</div>
              <div className="text-xs font-bold mt-1">{c.t}</div>
              <div className="text-[10px] opacity-80 mt-1">{c.d}</div>
            </div>
          ))}
        </div>
        <Checklist items={[
          "Staff-child ratio will be maintained at all times",
          "High risk areas must be supervised by highly experienced Educators",
          "High risk activities must have familiar and experienced Educators",
          "<strong>Ask to see the supervision plan when attending your first shift at a new service</strong>",
        ]} />
      </ContentBlock>

      <ContentBlock title="Ratios">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-surface"><th className="p-2 text-left">Setting / Activity</th><th className="p-2 text-left">Staff : Children</th></tr></thead>
            <tbody className="divide-y text-gray-600">
              <tr><td className="p-2">Standard regulation ratio</td><td className="p-2 font-bold">1 : 15</td></tr>
              <tr><td className="p-2">Low risk excursions</td><td className="p-2 font-bold">1 : 11</td></tr>
              <tr><td className="p-2">High risk excursions</td><td className="p-2 font-bold">1 : 8</td></tr>
              <tr><td className="p-2">Water-based excursions</td><td className="p-2 font-bold">1 : 5</td></tr>
              <tr><td className="p-2">Specialist Schools</td><td className="p-2 font-bold">1 : 2</td></tr>
            </tbody>
          </table>
        </div>
        <Alert type="warning"><strong>Important:</strong> Ratios must be maintained at all times. If ratios are not met, notify your Coordinator immediately.</Alert>
      </ContentBlock>
    </>
  );
}

function ChildProtectionSection() {
  return (
    <>
      <ContentBlock title="Child Safe Standards">
        <p className="text-sm text-gray-600 mb-3">The Child Safe Standards ensure children&apos;s safety is everyone&apos;s priority, promoting cultural safety for all children.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-surface"><th className="p-2 text-left">Standard</th><th className="p-2 text-left">Description</th></tr></thead>
            <tbody className="divide-y text-gray-600">
              {[
                ["1", "Strategies to embed an organisational culture of child safety"],
                ["2", "A child safe policy or statement of commitment to child safety"],
                ["3", "A code of conduct that establishes clear expectations for appropriate behaviour"],
                ["4", "Screening, supervision, training and HR practices that reduce risk"],
                ["5", "Processes for responding to and reporting suspected child abuse"],
                ["6", "Strategies to identify and reduce or remove the risk of child abuse"],
                ["7", "Strategies to promote the participation and empowerment of children"],
              ].map(([n, d]) => (
                <tr key={n}><td className="p-2 font-bold">Standard {n}</td><td className="p-2">{d}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </ContentBlock>

      <ContentBlock title="Educator Responsibilities">
        <Checklist items={[
          "Recognise and respond appropriately to vulnerabilities, risks and needs of children",
          "Actively seek feedback from an authorised agency after making a child protection report",
          "Collaborate in joint investigations relating to alleged child abuse",
          "Report any suspicion of child abuse to the appropriate agency",
        ]} />
        <Alert type="danger"><strong>Legal Obligation:</strong> Amana OSHC staff will report any signs, conversations and behaviour that may compromise the health and wellbeing of a child. Failure to report carries heavy fines, civil suit and jail time.</Alert>
      </ContentBlock>

      <ContentBlock title="Who to Contact">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-surface"><th className="p-2 text-left">State</th><th className="p-2 text-left">Authority</th><th className="p-2 text-left">Contact</th></tr></thead>
            <tbody className="divide-y text-gray-600">
              <tr><td className="p-2 font-bold">NSW</td><td className="p-2">Child Protection Helpline</td><td className="p-2 font-bold">13 2111</td></tr>
              <tr><td className="p-2 font-bold">VIC</td><td className="p-2">Child First</td><td className="p-2 font-bold">(03) 9329 4822</td></tr>
              <tr><td className="p-2 font-bold">WA</td><td className="p-2">Central Intake Team</td><td className="p-2 font-bold">1800 273 889</td></tr>
            </tbody>
          </table>
        </div>
        <Alert type="info">If unsure about the process, ask your Coordinator or Area Manager.</Alert>
      </ContentBlock>
    </>
  );
}

function CollectionSection() {
  return (
    <>
      <ContentBlock title="Late/Non-Arrival Procedure">
        <p className="text-sm text-gray-600 mb-3">Follow the Keeping Children Safe: Non-arrival/missing child process.</p>
        <div className="space-y-3">
          {[
            { time: "3:15", c: "bg-green-500", d: "Safe arrival time - all booked children should be present and signed in" },
            { time: "3:25", c: "bg-amber-500", d: "Make a PA announcement and/or contact the school office. Call and text parent" },
            { time: "3:30", c: "bg-orange-600", d: "Continue to contact parent and all emergency contacts. Contact Area Manager" },
            { time: "3:40", c: "bg-red-600", d: "CALL EMERGENCY 000" },
          ].map((s) => (
            <div key={s.time} className="flex items-start gap-3">
              <span className={`${s.c} text-white text-xs font-bold px-2 py-1 rounded min-w-[50px] text-center`}>{s.time}</span>
              <span className="text-sm text-gray-700">{s.d}</span>
            </div>
          ))}
        </div>
      </ContentBlock>

      <ContentBlock title="Authorisation to Collect">
        <Checklist items={[
          "Only release a child to a person listed as <strong>authorised</strong> on their enrolment form",
          "An emergency contact must produce <strong>photo ID</strong> and must be over 18 years of age",
          "Must have <strong>prior communication with the parent</strong> to confirm their unavailability",
          "If a parent/carer appears impaired, <strong>do not release the child</strong> - contact Centre Director immediately",
          "Never allow an unauthorised person to take a child, regardless of any verbal instruction",
        ]} />
        <Alert type="danger"><strong>Never release a child to an unauthorised person</strong> under any circumstances.</Alert>
      </ContentBlock>
    </>
  );
}

function MedicalSection() {
  return (
    <>
      <ContentBlock title="Medical Conditions">
        <p className="text-sm text-gray-600 mb-3">A <strong>Risk Minimisation Plan</strong> must be developed for each child with a medical condition. Copies must be:</p>
        <Checklist items={["In the child's enrolment form", "In the medical folder", "With the medication"]} />
        <Alert type="warning"><strong>Expired Medications:</strong> Contact the parent immediately. A replacement must be provided before the child attends again.</Alert>
      </ContentBlock>

      <ContentBlock title="Administration of Medication">
        <Checklist items={[
          "Parents must sign the <strong>medication authorisation form</strong>",
          "Children are not to self-medicate while in attendance",
          "Medication must be stored as recommended and away from other children",
          "Medication must <strong>NOT</strong> be kept in the child's school bag",
          "All medication must be in the original package with child's full name and prescribed dosage",
          "When administering, <strong>two Educators must be present</strong> and both must sign",
          "On collection, parent must acknowledge the administration and provide a signature",
        ]} />
      </ContentBlock>

      <ContentBlock title="Reportable Incidents">
        <Alert type="danger"><strong>The following must be reported to the Regulatory Authority within 24 hours:</strong></Alert>
        <Checklist items={[
          "An emergency service attends the service",
          "A child seeks medical attention for an injury at the service",
          "Broken/fracture bones",
          "Head injury requiring medical attention",
          "Child has not arrived at care (non-arrival/missing child)",
          "Child cannot be accounted for during care for longer than 5 minutes",
          "Loss of a child",
          "Child locked in or out of the service",
          "Child walked off school premises or licenced space",
          "Child has an asthma attack or anaphylactic reaction where an Epi-pen has been administered",
          "The death of a child",
        ]} />
        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-600 mt-4 mb-2">In the Event of a Serious Incident</h3>
        <StepList steps={[
          "Contact emergency services (000)",
          "Contact your Area Manager <strong>immediately</strong>",
          "Contact parent/s <strong>immediately</strong>",
          "Area Manager must complete ACECQA notification within 24 hours",
          "Document all details - time, date and every step taken",
        ]} />
      </ContentBlock>
    </>
  );
}

function PoliciesSection() {
  const policies = [
    { n: 1, t: "Behaviour Guidance Policy", d: "Guides how educators support children to develop self-regulation using encouragement and natural consequences.", items: ["Use positive language and redirection; avoid shouting, threats or physical punishment", "Model respectful behaviour and calm communication at all times", "Involve children in setting fair group agreements", "Document and report persistent behaviour concerns to the Centre Director", "Never use isolation, humiliation or food as a behaviour management tool"] },
    { n: 2, t: "Child Protection Policy", d: "Sets out legal and ethical obligations to protect every child from abuse, neglect and harm.", items: ["Complete mandatory reporter training and keep it current", "Report any suspicion of child abuse to the Centre Director immediately", "A report to the Child Protection Helpline (132 111) is required if you have a reasonable belief a child is at risk", "Never disclose to a parent that a report has been made if doing so could place a child at further risk", "Document all observations, disclosures and actions factually and promptly"] },
    { n: 3, t: "Child Safe Environment Policy", d: "Ensures all staff create and maintain an environment where children are physically and emotionally safe.", items: ["Actively supervise children at all times according to required ratios", "Complete all required child safe training", "Report any unsafe physical environment to the Centre Director", "Foster a culture where children feel heard and are encouraged to speak up", "Never be alone with a single child behind closed doors"] },
    { n: 4, t: "Code of Conduct Policy", d: "Outlines the professional standards and behaviours expected of all Amana staff.", items: ["Treat all children, families and colleagues with respect, dignity and cultural sensitivity", "Maintain professional boundaries - do not share personal contact details with families", "Dress in your Amana uniform and present professionally", "Do not discuss confidential information outside of work", "Report any breach of the Code of Conduct to the Centre Director"] },
    { n: 5, t: "Dealing with Complaints Policy", d: "Describes how families and staff can raise concerns and how Amana responds.", items: ["Listen respectfully, acknowledge feelings and refer to Centre Director", "Do not dismiss, minimise or argue with a complainant", "Document all complaints in writing", "Never discuss a complaint with uninvolved families or staff", "Follow up to ensure complaints are resolved"] },
    { n: 6, t: "Delivery and Collection of Children Policy", d: "Ensures children are only released to authorised persons.", items: ["Only release to authorised persons - check ID if unfamiliar", "Record every arrival and departure in OWNA at the time it occurs", "Follow the Late/Non-Collection procedure if a child is not collected by close", "If a parent appears impaired, do not release the child", "Never allow an unauthorised person to take a child"] },
    { n: 7, t: "Educational Program Policy", d: "Ensures our program is planned, documented and evaluated against the MTOP Framework.", items: ["Contribute to program planning by observing and documenting children's interests", "Ensure activities are intentional, inclusive and aligned to MTOP", "Record observations and evaluations in OWNA", "Invite children's voices and choices into daily activities", "Reflect on program effectiveness in team meetings"] },
    { n: 8, t: "Emergency and Evacuation Policy", d: "Describes how staff must respond to emergencies to keep children and staff safe.", items: ["Know the location of all emergency exits, assembly points and the Emergency Management Plan", "Respond immediately and calmly to any alarm or emergency", "Account for every child using the OWNA roll during any evacuation", "Call 000 for life-threatening emergencies", "Participate in all required emergency drills and debriefs"] },
    { n: 9, t: "Administration of First Aid Policy", d: "Sets out how first aid is to be administered and recorded.", items: ["Maintain current First Aid, CPR and Anaphylaxis management certificates", "Administer first aid promptly and within limits of your training", "Record every first aid event in OWNA immediately", "Notify the Centre Director of all first aid events on the day", "Never administer unauthorised medication"] },
    { n: 10, t: "Privacy and Confidentiality Policy", d: "Protects the personal and sensitive information of children, families and staff.", items: ["Never share personal information with unauthorised people", "Do not photograph children without prior parental consent on file", "Keep physical records secure and digital records password protected", "If aware of a privacy breach, notify the Centre Director immediately", "Access only the information you need to do your job"] },
    { n: 11, t: "Safe Arrival of Children Policy", d: "Ensures every child's arrival is confirmed and tracked.", items: ["Mark every child present in OWNA as soon as they arrive", "If a booked child does not arrive, contact the family within 15 minutes", "Escalate to the Centre Director if a child cannot be accounted for", "Record any safe-arrival call or action taken in OWNA", "Never assume a child is absent without confirmation"] },
    { n: 12, t: "Safe Use of Digital Technologies Policy", d: "Guides safe, ethical and age-appropriate use of digital devices.", items: ["Supervise children's use of devices and internet at all times", "Only use approved, age-appropriate digital resources", "Do not use your personal mobile phone during supervision", "Report any concerning online behaviour to the Centre Director", "Never allow children to access social media or unfiltered internet"] },
    { n: 13, t: "Sick Leave Policy", d: "Outlines entitlements and process for taking personal/sick leave.", items: ["Notify your Centre Director as early as possible if you are unwell", "Do not attend work if you have a contagious illness", "Provide a medical certificate for 3+ consecutive days", "Advise families not to bring unwell children; follow exclusion period guidelines", "Record your leave accurately through the OWNA staff module"] },
    { n: 14, t: "Work Health and Safety (WHS) Policy", d: "Reflects Amana's commitment to providing a safe and healthy workplace.", items: ["Report all hazards, near-misses and incidents on the day they occur", "Follow all safe work procedures and use equipment as instructed", "Do not lift more than is safely manageable", "Participate in WHS training, inductions and risk assessments", "Raise any WHS concerns without fear of reprisal"] },
  ];

  return (
    <>
      {policies.map((p) => (
        <ContentBlock key={p.n} title={`${p.n}. ${p.t}`}>
          <p className="text-sm text-gray-600 mb-3">{p.d}</p>
          <h3 className="text-xs font-bold uppercase tracking-wider text-teal-600 mb-2">As an Educator, you must:</h3>
          <Checklist items={p.items} />
        </ContentBlock>
      ))}
    </>
  );
}

function AcknowledgementSection() {
  return (
    <>
      <ContentBlock title="Policy Acknowledgement">
        <p className="text-sm text-gray-600 mb-3">I acknowledge that I have read and understood all 14 Amana OSHC policies listed in the Policies section.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            "Behaviour Guidance", "Emergency and Evacuation", "Child Protection", "Administration of First Aid",
            "Child Safe Environment", "Privacy and Confidentiality", "Code of Conduct", "Safe Arrival of Children",
            "Dealing with Complaints", "Safe Use of Digital Technologies", "Delivery and Collection", "Sick Leave",
            "Educational Program", "Work Health and Safety (WHS)",
          ].map((p) => (
            <div key={p} className="flex items-center gap-2 text-sm py-1.5 border-b border-gray-100">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-gray-600">{p} Policy</span>
            </div>
          ))}
        </div>
      </ContentBlock>

      <ContentBlock title="Educator Declaration">
        <p className="text-sm text-gray-600 mb-4">At Amana OSHC, understanding our policies and procedures is essential to providing a safe, high-quality and inclusive environment for all children.</p>
        <div className="space-y-3">
          {[
            "I understand that these policies are designed to keep children, families and staff safe and supported at all times.",
            "I agree to uphold Amana OSHC's values of care, respect and professionalism in all aspects of my role.",
            "I understand that failure to follow these policies may result in further review or disciplinary action.",
            "I commit to asking questions if anything is unclear and to staying updated on any policy changes.",
          ].map((text, i) => (
            <label key={i} className="flex items-start gap-3 text-sm cursor-pointer p-3 border border-gray-200 rounded-lg bg-amber-50/50 hover:bg-amber-50">
              <input type="checkbox" className="mt-0.5 w-4 h-4 accent-brand flex-shrink-0" />
              <span className="text-gray-700">{text}</span>
            </label>
          ))}
        </div>
      </ContentBlock>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

export function TheAmanaWay() {
  const [activeSection, setActiveSection] = useState("welcome");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const section = SECTIONS.find((s) => s.id === activeSection) || SECTIONS[0];

  // Simple search filter for sections
  const filteredSections = useMemo(() => {
    if (!search.trim()) return SECTIONS;
    const q = search.toLowerCase();
    return SECTIONS.filter((s) => s.label.toLowerCase().includes(q) || s.tag.toLowerCase().includes(q) || s.title.toLowerCase().includes(q));
  }, [search]);

  const navigate = (id: string) => {
    setActiveSection(id);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const renderSection = () => {
    switch (activeSection) {
      case "welcome": return <WelcomeSection />;
      case "identity": return <IdentitySection />;
      case "what-we-do": return <WhatWeDoSection />;
      case "roles": return <RolesSection />;
      case "first-day": return <FirstDaySection />;
      case "daily": return <DailyOpsSection />;
      case "mtop": return <MTOPSection />;
      case "supervision": return <SupervisionSection />;
      case "childprotection": return <ChildProtectionSection />;
      case "collection": return <CollectionSection />;
      case "medical": return <MedicalSection />;
      case "policies": return <PoliciesSection />;
      case "acknowledgement": return <AcknowledgementSection />;
      default: return <WelcomeSection />;
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-120px)]">
      {/* Mobile toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed bottom-4 right-4 z-50 w-12 h-12 bg-brand text-white rounded-full shadow-lg flex items-center justify-center"
      >
        <BookOpen className="w-5 h-5" />
      </button>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:sticky top-0 lg:top-0 left-0 z-40 lg:z-auto w-64 h-screen lg:h-auto bg-white border-r border-gray-200 overflow-y-auto transition-transform flex-shrink-0`}>
        <div className="p-4 border-b border-gray-200 bg-brand">
          <h2 className="text-sm font-bold text-white">The Amana Way</h2>
          <p className="text-[10px] text-white/60 uppercase tracking-widest mt-0.5">Educators Induction Module</p>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search topics..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-brand focus:border-brand"
            />
          </div>
        </div>

        {/* Nav items */}
        <nav className="py-2">
          {filteredSections.map((s) => (
            <button
              key={s.id}
              onClick={() => navigate(s.id)}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors border-l-3 ${
                activeSection === s.id
                  ? "bg-sky-50 text-brand border-l-brand font-semibold border-l-[3px]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-brand border-l-transparent border-l-[3px]"
              }`}
            >
              {s.icon}
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 lg:pl-0">
        {/* Section header */}
        <div className="bg-brand text-white rounded-xl p-5 md:p-6 mb-6 relative overflow-hidden border-b-4 border-brand-yellow">
          <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-brand-yellow/5" />
          <span className="inline-block bg-brand-yellow text-brand text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded mb-2">{section.tag}</span>
          <h1 className="text-xl md:text-2xl font-black mb-1">{section.title}</h1>
          <p className="text-sm text-white/70 max-w-lg">{section.subtitle}</p>
        </div>

        {renderSection()}

        {/* Navigation buttons */}
        <div className="flex justify-between mt-8 mb-4">
          {SECTIONS.findIndex((s) => s.id === activeSection) > 0 ? (
            <button onClick={() => navigate(SECTIONS[SECTIONS.findIndex((s) => s.id === activeSection) - 1].id)} className="text-sm text-brand hover:underline">&larr; Previous</button>
          ) : <div />}
          {SECTIONS.findIndex((s) => s.id === activeSection) < SECTIONS.length - 1 ? (
            <button onClick={() => navigate(SECTIONS[SECTIONS.findIndex((s) => s.id === activeSection) + 1].id)} className="text-sm text-brand hover:underline">Next &rarr;</button>
          ) : <div />}
        </div>
      </main>
    </div>
  );
}
