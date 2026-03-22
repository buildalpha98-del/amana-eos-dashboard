import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
interface SeedSnippet {
  title: string;
  summary: string;
  category: string;
  priority: string;
}

const SEED_SNIPPETS: SeedSnippet[] = [
  {
    title: "Injury Response Protocol",
    category: "safety",
    priority: "high",
    summary: [
      "1. Assess severity of the injury immediately",
      "2. Administer appropriate first aid (qualified staff only)",
      "3. Call 000 for an ambulance if the injury is serious",
      "4. Notify the child's parent/guardian as soon as practical",
      "5. Complete an incident report form with full details",
      "6. Report to the regulatory authority if the injury is serious (within 24 hours)",
      "7. Review the incident with staff to identify preventive measures",
    ].join("\n"),
  },
  {
    title: "Missing Child Protocol",
    category: "safety",
    priority: "high",
    summary: [
      "1. Conduct an immediate headcount of all children",
      "2. Search the entire premises — indoors, outdoors, storage areas",
      "3. Notify the coordinator and centre admin immediately",
      "4. Call Police (000) if the child is not found within 15 minutes",
      "5. Notify the child's parent/guardian",
      "6. Complete a detailed incident report documenting timeline and actions",
      "7. Report to the regulatory authority as a serious incident",
    ].join("\n"),
  },
  {
    title: "Medication Error Protocol",
    category: "safety",
    priority: "high",
    summary: [
      "1. Assess the child's condition for any immediate symptoms",
      "2. Contact Poisons Information Centre: 13 11 26",
      "3. Notify the child's parent/guardian immediately",
      "4. Seek medical advice — call 000 if the child is unwell",
      "5. Complete a medication error report with full details",
      "6. Review medication administration procedures with staff",
      "7. Report to the regulatory authority if medical treatment is required",
    ].join("\n"),
  },
  {
    title: "Anaphylaxis Emergency",
    category: "safety",
    priority: "high",
    summary: [
      "1. Lay the child flat (if breathing) — do NOT stand them up",
      "2. Administer the child's EpiPen/Anapen into outer mid-thigh",
      "3. Call 000 and request an ambulance immediately",
      "4. Start CPR if the child becomes unresponsive and not breathing",
      "5. Notify the child's parent/guardian",
      "6. Record all actions taken with exact times",
      "7. Complete an incident report and notify the regulatory authority",
    ].join("\n"),
  },
  {
    title: "Illness Outbreak Protocol",
    category: "safety",
    priority: "high",
    summary: [
      "1. Isolate the affected child in a supervised, comfortable area",
      "2. Notify the parent/guardian for immediate collection",
      "3. Sanitise all affected areas, toys, and surfaces",
      "4. Log symptoms, onset time, and any food consumed",
      "5. Notify the Health Department if 2 or more cases occur",
      "6. Advise families of the outbreak (without identifying affected children)",
      "7. Enforce exclusion periods per health guidelines before the child returns",
    ].join("\n"),
  },
];

// POST /api/incidents/seed — owner-only seed of incident response protocol snippets
export const POST = withApiAuth(async (req, session) => {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const snippet of SEED_SNIPPETS) {
    const exists = await prisma.infoSnippet.findFirst({
      where: { title: snippet.title },
    });

    if (exists) {
      skipped.push(snippet.title);
      continue;
    }

    await prisma.infoSnippet.create({
      data: {
        title: snippet.title,
        summary: snippet.summary,
        category: snippet.category,
        priority: snippet.priority,
        active: true,
        createdById: session?.user?.id ?? null,
      },
    });

    created.push(snippet.title);
  }

  return NextResponse.json({
    success: true,
    created,
    skipped,
    message: `Created ${created.length} snippets, skipped ${skipped.length} (already exist)`,
  });
}, { roles: ["owner"] });
