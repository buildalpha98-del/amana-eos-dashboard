/**
 * Branded Amana OSHC PDF export of a Centre Avatar.
 *
 * A single top-to-bottom document covering every section that lives on
 * the Avatar detail page — the four editable JSON blobs (snapshot,
 * parent avatar, programme mix, asset library) plus the five living
 * logs (insights, campaigns, coordinator check-ins, school liaison,
 * update log). The point of this export is a paper/PDF backup: if the
 * dashboard data is ever lost, everything a centre would need to
 * rebuild their Avatar is on these pages.
 *
 * Shares the same brand primitives as the V/TO / enrolment / report
 * PDFs — Midnight Green header band, two-tone "Amana OSHC." logo,
 * shared checkPage / heading / row / paragraph helpers.
 */

import type jsPDF from "jspdf";
import { BRAND, drawLogo, createPdfBuilder } from "@/lib/pdf/branding";

export interface CentreAvatarPdfData {
  serviceName: string;
  state: string | null;
  version: number;
  freshness: "fresh" | "aging" | "stale";
  lastUpdatedAt: string;
  lastUpdatedBy: { name: string | null } | null;
  lastReviewedAt: string | null;
  lastReviewedBy: { name: string | null } | null;
  snapshot: unknown | null;
  parentAvatar: unknown | null;
  programmeMix: unknown | null;
  assetLibrary: unknown | null;
  insights: Array<{
    occurredAt: string;
    source: string;
    insight: string;
    impactOnAvatar: string | null;
    status: string;
    createdBy?: { name: string | null } | null;
  }>;
  campaignLog: Array<{
    occurredAt: string;
    campaignName: string;
    contentUsed: string | null;
    result: string | null;
    learnings: string | null;
    createdBy?: { name: string | null } | null;
  }>;
  coordinatorCheckIns: Array<{
    occurredAt: string;
    topicsDiscussed: string;
    actionItems: string | null;
    followUpDate: string | null;
    coordinator?: { name: string | null } | null;
  }>;
  schoolLiaisonLog: Array<{
    occurredAt: string;
    contactName: string;
    purpose: string;
    outcome: string | null;
    nextStep: string | null;
    createdBy?: { name: string | null } | null;
  }>;
  updateLog: Array<{
    occurredAt: string;
    sectionsChanged: string[];
    summary: string;
    updatedBy?: { name: string | null } | null;
  }>;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(iso);
  }
}

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function pickObj(source: unknown, key: string): Record<string, unknown> | null {
  if (!source || typeof source !== "object") return null;
  const v = (source as Record<string, unknown>)[key];
  if (!v || typeof v !== "object") return null;
  return v as Record<string, unknown>;
}

function pickArray(source: unknown, key: string): unknown[] {
  if (!source || typeof source !== "object") return [];
  const v = (source as Record<string, unknown>)[key];
  return Array.isArray(v) ? v : [];
}

export async function generateCentreAvatarPdf(
  data: CentreAvatarPdfData,
): Promise<jsPDF> {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;

  // ── Header band ──
  doc.setFillColor(...BRAND.green.rgb);
  doc.rect(0, 0, pageWidth, 32, "F");
  drawLogo(doc, { x: margin, y: 14, fontSize: 18 });

  doc.setFontSize(10);
  doc.setTextColor(...BRAND.cream.rgb);
  doc.setFont("helvetica", "normal");
  doc.text("CENTRE AVATAR", margin, 22);

  doc.setFontSize(8);
  const updatedLine = data.lastUpdatedBy?.name
    ? `Last updated ${formatDate(data.lastUpdatedAt)} · ${data.lastUpdatedBy.name}`
    : `Last updated ${formatDate(data.lastUpdatedAt)}`;
  doc.text(updatedLine, pageWidth - margin, 22, { align: "right" });

  const b = createPdfBuilder(doc, { margin });
  b.y = 40;

  // ── Centre title + meta line ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...BRAND.green.rgb);
  doc.text(data.serviceName, margin, b.y);
  b.y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  const metaParts = [
    data.state ? `State: ${data.state}` : null,
    `v${data.version}`,
    `Freshness: ${data.freshness}`,
    data.lastReviewedAt
      ? `Reviewed ${formatDate(data.lastReviewedAt)}${data.lastReviewedBy?.name ? ` · ${data.lastReviewedBy.name}` : ""}`
      : null,
  ].filter(Boolean);
  doc.text(metaParts.join("  ·  "), margin, b.y);
  b.y += 8;

  // ── Section 1 — Snapshot ──
  b.heading("1. CENTRE SNAPSHOT");

  const cd = pickObj(data.snapshot, "centreDetails");
  if (cd) {
    b.row("Official name:", s(cd.officialName));
    b.row("Short name:", s(cd.shortName));
    b.row("State:", s(cd.state));
    b.row("Address:", s(cd.address));
    b.row("School:", s(cd.schoolName));
    b.row("School type:", s(cd.schoolType));
  }

  const coord = pickObj(data.snapshot, "coordinator");
  if (coord && Object.values(coord).some((v) => s(v))) {
    b.y += 2;
    subHeading(doc, b, "Coordinator");
    b.row("Name:", s(coord.name));
    b.row("Email:", s(coord.email));
    b.row("Phone:", s(coord.phone));
    b.row("Started:", s(coord.startedAt));
    b.row("Certifications:", s(coord.certifications));
    b.row("Languages:", s(coord.languages));
    if (s(coord.strengths)) {
      b.row("Strengths:", "");
      b.paragraph(s(coord.strengths));
    }
    if (s(coord.supportNeeds)) {
      b.row("Support needs:", "");
      b.paragraph(s(coord.supportNeeds));
    }
  }

  const schoolContacts = pickObj(data.snapshot, "schoolContacts");
  if (schoolContacts) {
    const contactLabels: Array<[string, string]> = [
      ["Principal", "principal"],
      ["Marketing coord.", "marketingCoord"],
      ["Admin lead", "adminLead"],
      ["Newsletter editor", "newsletterEditor"],
      ["Community liaison", "communityLiaison"],
    ];
    const rendered: Array<[string, string]> = [];
    for (const [label, key] of contactLabels) {
      const c = pickObj(schoolContacts, key);
      if (!c) continue;
      const parts = [
        s(c.name),
        s(c.email),
        s(c.phone),
        s(c.method) ? `(${s(c.method)})` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      if (parts) rendered.push([label, parts]);
    }
    if (rendered.length > 0) {
      b.y += 2;
      subHeading(doc, b, "School contacts");
      for (const [label, parts] of rendered) {
        b.row(`${label}:`, parts);
      }
    }
  }

  const cultureNotes = s(
    (data.snapshot as Record<string, unknown> | null)?.schoolCultureNotes,
  );
  if (cultureNotes) {
    b.y += 2;
    subHeading(doc, b, "School culture notes");
    b.paragraph(cultureNotes);
  }

  const nums = pickObj(data.snapshot, "numbers");
  if (nums && Object.values(nums).some((v) => v !== null && v !== undefined && v !== "")) {
    b.y += 2;
    subHeading(doc, b, "The numbers");
    b.row("Total school students:", s(nums.totalSchoolStudents));
    b.row("ASC enrolments:", s(nums.ascEnrolments));
    b.row(
      "Penetration rate:",
      typeof nums.penetrationRate === "number"
        ? `${(nums.penetrationRate * 100).toFixed(1)}%`
        : "",
    );
    b.row("Waitlist:", s(nums.waitlist));
    b.row("Average attendance:", s(nums.averageAttendance));
  }

  const drivers = (data.snapshot as Record<string, unknown> | null)?.parentDrivers;
  if (Array.isArray(drivers) && drivers.length > 0) {
    b.y += 2;
    subHeading(doc, b, "Parent drivers");
    b.paragraph(drivers.filter((d) => typeof d === "string" && d.trim()).join(", "));
  }
  const pFocus = s((data.snapshot as Record<string, unknown> | null)?.programmeFocus);
  if (pFocus) {
    b.row("Programme focus:", pFocus);
  }

  // ── Section 2 — Parent Avatar ──
  b.y += 4;
  b.heading("2. PARENT AVATAR");

  const demo = pickObj(data.parentAvatar, "demographics");
  if (demo && Object.values(demo).some((v) => s(v))) {
    subHeading(doc, b, "Demographics");
    b.row("Age range:", s(demo.ageRange));
    b.row("Family structure:", s(demo.familyStructure));
    b.row("Income:", s(demo.income));
    b.row("Education:", s(demo.education));
    b.row("Occupations:", s(demo.occupations));
    b.row("Languages:", s(demo.languages));
  }

  const psy = pickObj(data.parentAvatar, "psychographics");
  if (psy && Object.values(psy).some((v) => s(v))) {
    b.y += 2;
    subHeading(doc, b, "Psychographics");
    longRow(b, "Primary concern", s(psy.primaryConcern));
    longRow(b, "Primary want", s(psy.primaryWant));
    longRow(b, "Top objections", s(psy.topObjections));
    longRow(b, "Enrol trigger", s(psy.enrolTrigger));
    longRow(b, "Deal breaker", s(psy.dealBreaker));
  }

  const dec = pickObj(data.parentAvatar, "decisionMaking");
  if (dec && Object.values(dec).some((v) => s(v))) {
    b.y += 2;
    subHeading(doc, b, "Decision making");
    b.row("Who decides:", s(dec.whoDecides));
    b.row("Influencers:", s(dec.influencers));
    b.row("Timeline:", s(dec.timeline));
  }

  const comm = pickObj(data.parentAvatar, "commPreferences");
  if (comm && Object.values(comm).some((v) => s(v))) {
    b.y += 2;
    subHeading(doc, b, "Communication preferences");
    b.row("Channel:", s(comm.channel));
    b.row("Frequency:", s(comm.frequency));
    b.row("Tone:", s(comm.tone));
    b.row("Language:", s(comm.language));
  }

  const cultSens = s(
    (data.parentAvatar as Record<string, unknown> | null)?.culturalSensitivities,
  );
  if (cultSens) {
    b.y += 2;
    subHeading(doc, b, "Cultural sensitivities");
    b.paragraph(cultSens);
  }
  const compet = s(
    (data.parentAvatar as Record<string, unknown> | null)?.competition,
  );
  if (compet) {
    b.y += 2;
    subHeading(doc, b, "Competition");
    b.paragraph(compet);
  }
  const commDyn = s(
    (data.parentAvatar as Record<string, unknown> | null)?.communityDynamics,
  );
  if (commDyn) {
    b.y += 2;
    subHeading(doc, b, "Community dynamics");
    b.paragraph(commDyn);
  }

  // ── Section 3 — Programme Mix ──
  b.y += 4;
  b.heading("3. PROGRAMME MIX");

  const pw = s((data.programmeMix as Record<string, unknown> | null)?.whatsWorking);
  if (pw) {
    subHeading(doc, b, "What's working");
    b.paragraph(pw);
  }
  const pnw = s((data.programmeMix as Record<string, unknown> | null)?.whatsNotWorking);
  if (pnw) {
    b.y += 2;
    subHeading(doc, b, "What's not working");
    b.paragraph(pnw);
  }
  const gaps = s((data.programmeMix as Record<string, unknown> | null)?.gaps);
  if (gaps) {
    b.y += 2;
    subHeading(doc, b, "Gaps");
    b.paragraph(gaps);
  }
  const programmes = pickArray(data.programmeMix, "programmes");
  if (programmes.length > 0) {
    b.y += 2;
    subHeading(doc, b, "Programmes");
    for (const raw of programmes) {
      if (!raw || typeof raw !== "object") continue;
      const p = raw as Record<string, unknown>;
      const line = [
        s(p.name),
        p.running === true ? "(running)" : p.running === false ? "(not running)" : "",
        p.attendance != null ? `attendance ${s(p.attendance)}` : "",
        p.capacity != null ? `capacity ${s(p.capacity)}` : "",
        s(p.status),
      ]
        .filter(Boolean)
        .join(" · ");
      if (line) {
        b.checkPage(6);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 30, 30);
        const lines = doc.splitTextToSize(`• ${line}`, pageWidth - margin * 2 - 6);
        doc.text(lines, margin + 3, b.y);
        b.y += lines.length * 4.5;
      }
    }
  }

  // ── Section 4 — Insights Log ──
  logSection(doc, b, "4. INSIGHTS LOG", data.insights, (row) => [
    `${formatDate(row.occurredAt)} · ${row.source}${row.status ? ` · ${row.status}` : ""}`,
    row.insight,
    row.impactOnAvatar ? `Impact: ${row.impactOnAvatar}` : null,
    row.createdBy?.name ? `— ${row.createdBy.name}` : null,
  ]);

  // ── Section 5 — Campaign Log ──
  logSection(doc, b, "5. CAMPAIGN LOG", data.campaignLog, (row) => [
    `${formatDate(row.occurredAt)} · ${row.campaignName}`,
    row.contentUsed ? `Content: ${row.contentUsed}` : null,
    row.result ? `Result: ${row.result}` : null,
    row.learnings ? `Learnings: ${row.learnings}` : null,
    row.createdBy?.name ? `— ${row.createdBy.name}` : null,
  ]);

  // ── Section 6 — Coordinator Check-ins ──
  logSection(
    doc,
    b,
    "6. COORDINATOR CHECK-INS",
    data.coordinatorCheckIns,
    (row) => [
      `${formatDate(row.occurredAt)}${row.coordinator?.name ? ` · ${row.coordinator.name}` : ""}`,
      `Topics: ${row.topicsDiscussed}`,
      row.actionItems ? `Actions: ${row.actionItems}` : null,
      row.followUpDate ? `Follow-up: ${formatDate(row.followUpDate)}` : null,
    ],
  );

  // ── Section 7 — School Liaison Log ──
  logSection(doc, b, "7. SCHOOL LIAISON LOG", data.schoolLiaisonLog, (row) => [
    `${formatDate(row.occurredAt)} · ${row.contactName}`,
    `Purpose: ${row.purpose}`,
    row.outcome ? `Outcome: ${row.outcome}` : null,
    row.nextStep ? `Next: ${row.nextStep}` : null,
    row.createdBy?.name ? `— ${row.createdBy.name}` : null,
  ]);

  // ── Section 8 — Asset Library ──
  b.y += 4;
  b.heading("8. ASSET LIBRARY");
  const al = data.assetLibrary as Record<string, unknown> | null;
  const assetPairs: Array<[string, string]> = [
    ["Photo library", s(al?.photoLibrary)],
    ["Video library", s(al?.videoLibrary)],
    ["Testimonials", s(al?.testimonials)],
    ["Parent consent list", s(al?.parentConsentList)],
    ["Staff photos", s(al?.staffPhotos)],
    ["Newsletter screenshots", s(al?.newsletterScreenshots)],
    ["Activation media", s(al?.activationMedia)],
  ];
  for (const [label, val] of assetPairs) {
    if (val) longRow(b, label, val);
  }
  const assetGaps = s(
    (data.assetLibrary as Record<string, unknown> | null)?.assetGaps,
  );
  if (assetGaps) {
    b.y += 2;
    subHeading(doc, b, "Asset gaps");
    b.paragraph(assetGaps);
  }

  // ── Section 9 — Update Log ──
  logSection(doc, b, "9. UPDATE LOG", data.updateLog, (row) => [
    `${formatDate(row.occurredAt)}${row.updatedBy?.name ? ` · ${row.updatedBy.name}` : ""}${row.sectionsChanged?.length ? ` · [${row.sectionsChanged.join(", ")}]` : ""}`,
    row.summary,
  ]);

  return doc;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function subHeading(
  doc: jsPDF,
  b: { y: number; checkPage: (n?: number) => void },
  text: string,
): void {
  b.checkPage(8);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.green.rgb);
  doc.text(text.toUpperCase(), 18, b.y);
  b.y += 5;
}

function longRow(
  b: {
    y: number;
    checkPage: (n?: number) => void;
    row: (l: string, v: string) => void;
    paragraph: (t: string) => void;
  },
  label: string,
  value: string,
): void {
  if (!value) return;
  if (value.length < 60) {
    b.row(`${label}:`, value);
  } else {
    b.row(`${label}:`, "");
    b.paragraph(value);
  }
}

function logSection<T>(
  doc: jsPDF,
  b: {
    y: number;
    checkPage: (n?: number) => void;
    heading: (t: string) => void;
    paragraph: (t: string) => void;
  },
  title: string,
  rows: T[],
  render: (row: T) => Array<string | null | undefined>,
): void {
  b.y += 4;
  b.heading(title);
  if (!rows || rows.length === 0) {
    b.paragraph("— none logged —");
    return;
  }
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  for (const row of rows) {
    const lines = render(row).filter((l): l is string => !!l && l.trim() !== "");
    if (lines.length === 0) continue;
    b.checkPage(6 + lines.length * 5);

    // Header line — bold, green
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.green.rgb);
    const head = doc.splitTextToSize(lines[0], pageWidth - margin * 2);
    doc.text(head, margin, b.y);
    b.y += head.length * 4.5 + 1;

    // Body lines
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    for (const line of lines.slice(1)) {
      const wrapped = doc.splitTextToSize(line, pageWidth - margin * 2 - 4);
      doc.text(wrapped, margin + 3, b.y);
      b.y += wrapped.length * 4.5;
    }
    b.y += 3;
  }
}
