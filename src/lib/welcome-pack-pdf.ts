/**
 * Centre-specific welcome pack PDF for new-enquiry parents.
 * Uses jsPDF with Amana branding (Midnight Green + Jonquil) via the
 * shared `pdf/branding` module.
 */

import type jsPDF from "jspdf";
import { BRAND, drawLogo, createPdfBuilder } from "@/lib/pdf/branding";

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
  const childRef = data.childName ? ` and ${data.childName}` : "";
  b.paragraph(
    `Dear ${data.parentName}${childRef},\n\nThank you for your interest in Amana OSHC at ${data.centre.name}. We are delighted to share this welcome pack with you. Amana OSHC provides government-subsidised before and after school care rooted in Islamic values. We focus on the intellectual, physical, and spiritual growth of every child. Our tagline is "Beyond The Bell".`
  );

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
  const programmes = [
    { name: "Rise and Shine Club", desc: "Before School Care (BSC) — 6:45am to school start. A calm, structured morning to fuel your child for the day." },
    { name: "Amana Afternoons", desc: "After School Care (ASC) — school end to 6:30pm. Structured programme with rotating activities." },
    { name: "Homework Heroes", desc: "Dedicated homework support time with educators to help your child stay on top of schoolwork." },
    { name: "Little Champions Club", desc: "Sports, team games, and physical activity sessions to keep children active and healthy." },
    { name: "Imagination Station", desc: "Arts, crafts, and STEM projects that spark creativity and problem-solving skills." },
    { name: "Iqra Circle", desc: "Quran recitation and Islamic studies in a nurturing, inclusive environment." },
    { name: "Fuel Up with Amana", desc: "Cooking and nutrition workshops where children learn healthy eating habits." },
    { name: "Holiday Quest", desc: "Full-day vacation care during school holidays with excursions, cooking, sports, and themed activities." },
  ];
  for (const p of programmes) {
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
  b.paragraph(
    "Most families are eligible for the Child Care Subsidy (CCS) through Centrelink, which can significantly reduce your out-of-pocket cost. Some families pay as little as $4 to $8 per session depending on their household income and activity level. Once enrolled, our team can help you estimate your cost."
  );

  // ── How to Enrol ──
  b.heading("How to Enrol");
  b.paragraph(
    "1. Visit amanaoshc.com.au and click 'Enrol Now' on the homepage.\n2. Complete the online enrolment form — it takes about 10 minutes.\n3. Set up your Child Care Subsidy (CCS) via myGov and link it to Amana OSHC.\n4. Our team will confirm your child's placement and start date.\n\nIf you need help at any stage, call us on 1300 200 262 or email contact@amanaoshc.com.au."
  );

  // ── Contact ──
  b.heading("Get in Touch");
  b.row("Phone", "1300 200 262");
  b.row("Email", "contact@amanaoshc.com.au");
  b.row("Website", "amanaoshc.com.au");

  // ── Footer ──
  const ph = doc.internal.pageSize.getHeight();
  doc.setFillColor(...BRAND.green.rgb);
  doc.rect(0, ph - 15, pw, 15, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text("Amana OSHC — Beyond The Bell  |  amanaoshc.com.au  |  1300 200 262", pw / 2, ph - 7, { align: "center" });

  return doc;
}
