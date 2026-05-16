/**
 * Centre-specific welcome pack PDF for new-enquiry parents.
 * Uses jsPDF with Amana branding (Midnight Green + Jonquil) via the
 * shared `pdf/branding` module.
 */

import type jsPDF from "jspdf";
import { BRAND, drawLogo, createPdfBuilder } from "@/lib/pdf/branding";
import { getOrgSettings } from "@/lib/org-settings";

function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : "",
  );
}

interface WelcomePackData {
  parentName: string;
  childName?: string;
  centre: {
    name: string;
    address?: string | null;
    suburb?: string | null;
    state?: string | null;
    postcode?: string | null;
    phone?: string | null;
    email?: string | null;
    bscDailyRate?: number | null;
    ascDailyRate?: number | null;
    bscCasualRate?: number | null;
    ascCasualRate?: number | null;
    vcDailyRate?: number | null;
  };
}

function fmt(amount: number | null | undefined): string {
  if (amount == null) return "Contact us";
  return `$${amount.toFixed(2)}`;
}

export async function generateWelcomePackPdf(data: WelcomePackData): Promise<jsPDF> {
  // 2026-05-16: copy moved to admin-editable OrgSettings.config.welcomePack.
  // Defaults are baked into ORG_SETTINGS_DEFAULTS so this still works in a
  // fresh DB. Placeholders supported: {{parentName}}, {{childName}},
  // {{childRef}} (" and Sara" when childName present; "" otherwise),
  // {{centreName}}.
  const orgSettings = await getOrgSettings();
  const wp = orgSettings.welcomePack;
  const vars: Record<string, string> = {
    parentName: data.parentName,
    childName: data.childName ?? "",
    childRef: data.childName ? ` and ${data.childName}` : "",
    centreName: data.centre.name,
  };

  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF("p", "mm", "a4");
  const pw = doc.internal.pageSize.getWidth();
  const margin = 20;
  const cw = pw - margin * 2;

  const b = createPdfBuilder(doc, { margin });

  // ── Header ──
  doc.setFillColor(...BRAND.green.rgb);
  doc.rect(0, 0, pw, 40, "F");
  drawLogo(doc, { x: margin, y: 18, fontSize: 22 });

  doc.setFontSize(12);
  doc.setTextColor(...BRAND.cream.rgb);
  doc.text("Welcome Pack", margin, 30);
  doc.setFontSize(9);
  doc.text(data.centre.name, pw - margin, 30, { align: "right" });

  b.y = 50;

  // ── Welcome ──
  b.heading("Welcome to Amana OSHC");
  b.paragraph(interpolate(wp.welcomeIntro, vars));

  // ── Centre Details ──
  b.heading("Your Centre");
  b.row("Centre", data.centre.name);
  const address = [data.centre.address, data.centre.suburb, data.centre.state, data.centre.postcode].filter(Boolean).join(", ");
  if (address) b.row("Address", address);
  if (data.centre.phone) b.row("Phone", data.centre.phone);
  if (data.centre.email) b.row("Email", data.centre.email);
  b.y += 4;

  // ── Our Programmes ──
  b.heading("Our Programmes");
  for (const p of wp.programmes) {
    b.checkPage(12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.green.rgb);
    doc.text(p.name, margin, b.y);
    b.y += 4;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    const lines = doc.splitTextToSize(p.desc, cw);
    doc.text(lines, margin, b.y);
    b.y += lines.length * 4 + 4;
  }

  // ── Pricing ──
  b.heading("Session Rates");
  b.row("Rise and Shine Club (BSC)", `${fmt(data.centre.bscDailyRate)} per session (regular)  |  ${fmt(data.centre.bscCasualRate)} casual`);
  b.row("Amana Afternoons (ASC)", `${fmt(data.centre.ascDailyRate)} per session (regular)  |  ${fmt(data.centre.ascCasualRate)} casual`);
  b.row("Holiday Quest", `${fmt(data.centre.vcDailyRate)} per session (approx.)`);
  b.y += 3;
  b.paragraph(wp.ratesIntro);

  // ── How to Enrol ──
  b.heading("How to Enrol");
  b.paragraph(wp.enrolSteps);

  // ── Contact ──
  b.heading("Get in Touch");
  if (wp.contactPhone) b.row("Phone", wp.contactPhone);
  if (wp.contactEmail) b.row("Email", wp.contactEmail);
  if (wp.contactWebsite) b.row("Website", wp.contactWebsite);

  // ── Footer ──
  const ph = doc.internal.pageSize.getHeight();
  doc.setFillColor(...BRAND.green.rgb);
  doc.rect(0, ph - 15, pw, 15, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text(wp.footerLine, pw / 2, ph - 7, { align: "center" });

  return doc;
}
