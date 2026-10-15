/**
 * GET /api/parent-journey — the Parent journey page's data: the stage map,
 * centres to preview with, which sequences are switched on, and how many of
 * each email went out in the last 30 days (and how many are queued).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { PARENT_JOURNEY } from "@/lib/parent-journey-map";

const JOURNEY_ROLES = ["owner", "head_office", "admin", "marketing"] as const;

export const GET = withApiAuth(
  async () => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [services, sequences, sent, pending, welcomes] = await Promise.all([
      prisma.service.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.sequence.findMany({ where: { type: "parent_nurture" }, select: { name: true, triggerStage: true, isActive: true } }),
      prisma.sequenceStepExecution.findMany({
        where: { status: "sent", sentAt: { gte: since }, enrolment: { sequence: { type: "parent_nurture" } } },
        select: { step: { select: { templateKey: true } } },
      }),
      prisma.sequenceStepExecution.findMany({
        where: { status: "pending", enrolment: { sequence: { type: "parent_nurture" } } },
        select: { step: { select: { templateKey: true } } },
      }),
      prisma.enrolmentSubmission.count({ where: { welcomeEmailSentAt: { gte: since } } }),
    ]);
    const stats: Record<string, { sent30: number; pending: number }> = {};
    const bump = (k: string, f: "sent30" | "pending") => {
      stats[k] ??= { sent30: 0, pending: 0 };
      stats[k][f]++;
    };
    sent.forEach((e) => bump(e.step.templateKey, "sent30"));
    pending.forEach((e) => bump(e.step.templateKey, "pending"));
    return NextResponse.json({ stages: PARENT_JOURNEY, services, sequences, stats, welcomeSent30: welcomes });
  },
  { roles: [...JOURNEY_ROLES] },
);
