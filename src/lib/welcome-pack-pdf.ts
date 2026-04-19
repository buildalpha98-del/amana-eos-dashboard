/**
 * Centre-specific welcome pack PDF for new-enquiry parents.
 * Uses jsPDF with Amana branding (Midnight Green + Jonquil).
 */

import type jsPDF from "jspdf";

interface WelcomePackData {
  parentName: string;
  childName?: string;
  centre: {
    name: string;
    address?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
    phone?: string;
    email?: string;
    bscDailyRate?: number | null;
    ascDailyRate?: number | null;
    bscCasualRate?: number | null;
    ascCasualRate?: number | null;
    vcDailyRate?: number | null;
  };
}

const BRAND = { green: [0, 78, 100] as const, yellow: [254, 206, 0] as const };

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
  let y = margin;

  function checkPage(needed = 20) {
    if (y + needed > 275) {
      doc.addPage();
      y = margin;
    }
  }

  function heading(text: string) {
    checkPage(15);
    doc.setFillColor(...BRAND.green);
    doc.rect(margin, y, cw, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(text, margin + 3, y + 5.5);
    y += 12;
    doc.setTextColor(30, 30, 30);
  }

  function row(label: string, value: string | null | undefined) {
    if (!value) return;
    checkPage(6);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(value, cw - 55);
    doc.text(lines, margin + 55, y);
    y += Math.max(lines.length * 4.5, 5);
  }

  function paragraph(text: string) {
    checkPage(10);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    const lines = doc.splitTextToSize(text, cw);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 3;
  }

  // ── Header ──
  doc.setFillColor(...BRAND.green);
  doc.rect(0, 0, pw, 40, "F");

  doc.setTextColor(...BRAND.yellow);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("Amana", margin, 18);
  const aw = doc.getTextWidth("Amana");
  doc.setTextColor(255, 255, 255);
  doc.text(" OSHC.", margin + aw, 18);

  doc.setFontSize(12);
  doc.setTextColor(255, 242, 191);
  doc.text("Welcome Pack", margin, 30);
  doc.setFontSize(9);
  doc.text(data.centre.name, pw - margin, 30, { align: "right" });

  y = 50;

  // ── Welcome ──
  heading("Welcome to Amana OSHC");
  const childRef = data.childName ? ` and ${data.childName}` : "";
  paragraph(
    `Dear ${data.parentName}${childRef},\n\nThank you for your interest in Amana OSHC at ${data.centre.name}. We are delighted to share this welcome pack with you. Amana OSHC provides government-subsidised before and after school care rooted in Islamic values. We focus on the intellectual, physical, and spiritual growth of every child. Our tagline is "Beyond The Bell".`
  );

  // ── Centre Details ──
  heading("Your Centre");
  row("Centre", data.centre.name);
  const address = [data.centre.address, data.centre.suburb, data.centre.state, data.centre.postcode].filter(Boolean).join(", ");
  if (address) row("Address", address);
  if (data.centre.phone) row("Phone", data.centre.phone);
  if (data.centre.email) row("Email", data.centre.email);
  y += 4;

  // ── Our Programmes ──
  heading("Our Programmes");
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
    checkPage(12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.green);
    doc.text(p.name, margin, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    const lines = doc.splitTextToSize(p.desc, cw);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 4;
  }

  // ── Pricing ──
  heading("Session Rates");
  row("Rise and Shine Club (BSC)", `${fmt(data.centre.bscDailyRate)} per session (regular)  |  ${fmt(data.centre.bscCasualRate)} casual`);
  row("Amana Afternoons (ASC)", `${fmt(data.centre.ascDailyRate)} per session (regular)  |  ${fmt(data.centre.ascCasualRate)} casual`);
  row("Holiday Quest", `${fmt(data.centre.vcDailyRate)} per session (approx.)`);
  y += 3;
  paragraph(
    "Most families are eligible for the Child Care Subsidy (CCS) through Centrelink, which can significantly reduce your out-of-pocket cost. Some families pay as little as $4 to $8 per session depending on their household income and activity level. Once enrolled, our team can help you estimate your cost."
  );

  // ── How to Enrol ──
  heading("How to Enrol");
  paragraph(
    "1. Visit amanaoshc.com.au and click 'Enrol Now' on the homepage.\n2. Complete the online enrolment form — it takes about 10 minutes.\n3. Set up your Child Care Subsidy (CCS) via myGov and link it to Amana OSHC.\n4. Our team will confirm your child's placement and start date.\n\nIf you need help at any stage, call us on 1300 200 262 or email contact@amanaoshc.com.au."
  );

  // ── Contact ──
  heading("Get in Touch");
  row("Phone", "1300 200 262");
  row("Email", "contact@amanaoshc.com.au");
  row("Website", "amanaoshc.com.au");

  // ── Footer ──
  const ph = doc.internal.pageSize.getHeight();
  doc.setFillColor(...BRAND.green);
  doc.rect(0, ph - 15, pw, 15, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text("Amana OSHC — Beyond The Bell  |  amanaoshc.com.au  |  1300 200 262", pw / 2, ph - 7, { align: "center" });

  return doc;
}
