import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

interface SeedStep {
  name: string;
  delayHours: number;
  templateKey: string;
}

interface SeedSequence {
  name: string;
  type: "parent_nurture" | "crm_outreach";
  triggerStage: string;
  steps: SeedStep[];
}

const SEED_SEQUENCES: SeedSequence[] = [
  // Parent nurture sequences
  {
    name: "Info Sent Follow-up",
    type: "parent_nurture",
    triggerStage: "info_sent",
    steps: [
      { name: "CCS Assist", delayHours: 24, templateKey: "ccs_assist" },
      { name: "Nudge 1", delayHours: 72, templateKey: "nudge_1" },
    ],
  },
  {
    name: "Nurturing Follow-up",
    type: "parent_nurture",
    triggerStage: "nurturing",
    steps: [
      { name: "Nudge 2", delayHours: 120, templateKey: "nudge_2" },
      { name: "Final Nudge", delayHours: 288, templateKey: "final_nudge" },
    ],
  },
  {
    name: "Form Support",
    type: "parent_nurture",
    triggerStage: "form_started",
    steps: [
      { name: "Form Support", delayHours: 4, templateKey: "form_support" },
    ],
  },
  {
    name: "First Session Onboarding",
    type: "parent_nurture",
    triggerStage: "first_session",
    steps: [
      {
        name: "Session Reminder",
        delayHours: -24,
        templateKey: "session_reminder",
      },
      {
        name: "Day 1 Check-in",
        delayHours: 24,
        templateKey: "day1_checkin",
      },
      {
        name: "Day 3 Check-in",
        delayHours: 72,
        templateKey: "day3_checkin",
      },
      {
        name: "Week 2 Feedback",
        delayHours: 336,
        templateKey: "week2_feedback",
      },
      {
        name: "Month 1 Referral",
        delayHours: 720,
        templateKey: "month1_referral",
      },
    ],
  },
  // CRM outreach sequences
  {
    name: "New School Introduction",
    type: "crm_outreach",
    triggerStage: "new_lead",
    steps: [
      { name: "Intro Email", delayHours: 0, templateKey: "school_intro" },
      {
        name: "Info Pack Follow-up",
        delayHours: 168,
        templateKey: "school_info_pack",
      },
      { name: "Check-in", delayHours: 336, templateKey: "school_checkin" },
    ],
  },
  {
    name: "Post-Meeting Follow-up",
    type: "crm_outreach",
    triggerStage: "meeting_booked",
    steps: [
      { name: "Thank You", delayHours: 24, templateKey: "meeting_thanks" },
      {
        name: "Proposal Check-in",
        delayHours: 168,
        templateKey: "proposal_checkin",
      },
      {
        name: "Decision Nudge",
        delayHours: 336,
        templateKey: "decision_nudge",
      },
    ],
  },
  {
    name: "Tender Follow-up",
    type: "crm_outreach",
    triggerStage: "submitted",
    steps: [
      { name: "Confirmation", delayHours: 0, templateKey: "tender_confirm" },
      {
        name: "Status Check-in",
        delayHours: 336,
        templateKey: "tender_checkin",
      },
      {
        name: "Final Follow-up",
        delayHours: 672,
        templateKey: "tender_final",
      },
    ],
  },
];

// POST /api/sequences/seed — admin-only seed of default sequences
export async function POST() {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const created: string[] = [];
  const skipped: string[] = [];

  for (const seq of SEED_SEQUENCES) {
    const exists = await prisma.sequence.findFirst({
      where: { name: seq.name },
    });

    if (exists) {
      skipped.push(seq.name);
      continue;
    }

    await prisma.sequence.create({
      data: {
        name: seq.name,
        type: seq.type,
        triggerStage: seq.triggerStage,
        steps: {
          create: seq.steps.map((s, i) => ({
            stepNumber: i + 1,
            name: s.name,
            delayHours: s.delayHours,
            templateKey: s.templateKey,
          })),
        },
      },
    });

    created.push(seq.name);
  }

  return NextResponse.json({
    success: true,
    created,
    skipped,
    message: `Created ${created.length}, skipped ${skipped.length} (already exist)`,
  });
}
