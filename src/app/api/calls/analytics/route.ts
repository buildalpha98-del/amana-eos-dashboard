/**
 * GET /api/calls/analytics
 *
 * Aggregate call metrics for the analytics dashboard. Supports ?days=30 (default 30).
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const GET = withApiAuth(async (req) => {
  const url = new URL(req.url);
  const days = Math.min(parseInt(url.searchParams.get("days") ?? "30", 10), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where: Prisma.VapiCallWhereInput = { calledAt: { gte: since } };

  const calls = await prisma.vapiCall.findMany({
    where,
    select: {
      id: true,
      callType: true,
      urgency: true,
      status: true,
      centreName: true,
      calledAt: true,
      actionedAt: true,
      successEvaluation: true,
      repeatCaller: true,
      slaAlertedAt: true,
      linkedEnquiryId: true,
      linkedTodoId: true,
    },
    orderBy: { calledAt: "asc" },
  });

  // Total counts
  const total = calls.length;
  const actioned = calls.filter((c) => c.status === "actioned" || c.status === "closed").length;
  const enquiriesCreated = calls.filter((c) => c.linkedEnquiryId).length;
  const todosCreated = calls.filter((c) => c.linkedTodoId).length;
  const repeatCallers = calls.filter((c) => c.repeatCaller).length;
  const slaBreaches = calls.filter((c) => c.slaAlertedAt).length;
  const successfulCalls = calls.filter((c) => c.successEvaluation === true).length;

  // Avg time to action (in minutes)
  const actionTimes = calls
    .filter((c) => c.actionedAt && c.calledAt)
    .map((c) => (new Date(c.actionedAt!).getTime() - new Date(c.calledAt).getTime()) / 60000);
  const avgTimeToAction = actionTimes.length > 0
    ? Math.round(actionTimes.reduce((a, b) => a + b, 0) / actionTimes.length)
    : null;

  // By type
  const byType: Record<string, number> = {};
  for (const c of calls) {
    byType[c.callType] = (byType[c.callType] ?? 0) + 1;
  }

  // By centre
  const byCentre: Record<string, number> = {};
  for (const c of calls) {
    const key = c.centreName || "Unknown";
    byCentre[key] = (byCentre[key] ?? 0) + 1;
  }

  // By urgency
  const byUrgency: Record<string, number> = {};
  for (const c of calls) {
    byUrgency[c.urgency] = (byUrgency[c.urgency] ?? 0) + 1;
  }

  // Daily volume (for chart)
  const dailyMap: Record<string, number> = {};
  for (const c of calls) {
    const day = new Date(c.calledAt).toISOString().split("T")[0];
    dailyMap[day] = (dailyMap[day] ?? 0) + 1;
  }
  const dailyVolume = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  // Conversion: new_enquiry calls → enquiry created
  const newEnquiryCalls = calls.filter((c) => c.callType === "new_enquiry");
  const convertedEnquiries = newEnquiryCalls.filter((c) => c.linkedEnquiryId);
  const conversionRate = newEnquiryCalls.length > 0
    ? Math.round((convertedEnquiries.length / newEnquiryCalls.length) * 100)
    : null;

  // SLA compliance: urgent/critical calls actioned before SLA breach
  const slaTracked = calls.filter((c) => c.urgency === "urgent" || c.urgency === "critical");
  const slaCompliant = slaTracked.filter((c) => !c.slaAlertedAt);
  const slaComplianceRate = slaTracked.length > 0
    ? Math.round((slaCompliant.length / slaTracked.length) * 100)
    : null;

  return NextResponse.json({
    days,
    total,
    actioned,
    enquiriesCreated,
    todosCreated,
    repeatCallers,
    slaBreaches,
    successfulCalls,
    successRate: total > 0 ? Math.round((successfulCalls / total) * 100) : null,
    avgTimeToAction,
    conversionRate,
    slaComplianceRate,
    byType,
    byCentre,
    byUrgency,
    dailyVolume,
  });
});
