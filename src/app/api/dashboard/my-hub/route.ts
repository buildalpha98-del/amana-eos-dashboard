import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getWeekStart } from "@/lib/utils";
import type { CertificateType } from "@prisma/client";

// The 6 required certification types for compliance calculation
const REQUIRED_CERT_TYPES: CertificateType[] = [
  "wwcc",
  "first_aid",
  "anaphylaxis",
  "asthma",
  "cpr",
  "police_check",
];

const CERT_LABELS: Record<CertificateType, string> = {
  wwcc: "WWCC",
  first_aid: "First Aid",
  anaphylaxis: "Anaphylaxis",
  asthma: "Asthma",
  cpr: "CPR",
  police_check: "Police Check",
  annual_review: "Annual Review",
  child_protection: "Child Protection",
  geccko: "GECCKO",
  food_safety: "Food Safety",
  food_handler: "Food Handler",
  other: "Other",
};

function getCertStatus(
  expiryDate: Date | null
): "valid" | "expiring" | "expired" | "missing" {
  if (!expiryDate) return "missing";
  const now = new Date();
  const daysLeft = Math.ceil(
    (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 30) return "expiring";
  return "valid";
}

function getDaysLeft(expiryDate: Date | null): number | null {
  if (!expiryDate) return null;
  const now = new Date();
  return Math.ceil(
    (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
}

// GET /api/dashboard/my-hub
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const userId = session!.user.id;
  const userServiceId = session!.user.serviceId;
  const now = new Date();
  const weekStart = getWeekStart(now);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Run all queries in parallel
  const [allCerts, todos, enrollments, meetings, unreadAnnouncements] =
    await Promise.all([
      // 1. Compliance certificates for this user
      prisma.complianceCertificate.findMany({
        where: { userId },
        orderBy: { expiryDate: "desc" },
      }),

      // 2. Todos for this week
      prisma.todo.findMany({
        where: {
          assigneeId: userId,
          weekOf: weekStart,
          deleted: false,
        },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
        take: 8,
      }),

      // 3. LMS enrollments
      prisma.lMSEnrollment.findMany({
        where: { userId },
        include: {
          course: { select: { title: true } },
        },
      }),

      // 4. Upcoming meetings
      prisma.meeting.findMany({
        where: {
          date: { gte: now },
          status: "scheduled",
          ...(userServiceId
            ? { serviceIds: { has: userServiceId } }
            : {}),
        },
        orderBy: { date: "asc" },
        take: 3,
        select: {
          id: true,
          title: true,
          date: true,
        },
      }),

      // 5. Unread announcements
      prisma.announcement.findMany({
        where: {
          deleted: false,
          publishedAt: { not: null, gte: thirtyDaysAgo },
          OR: [
            ...(userServiceId
              ? [{ serviceId: userServiceId }]
              : []),
            { serviceId: null },
          ],
          NOT: {
            readReceipts: {
              some: { userId },
            },
          },
        },
        orderBy: { publishedAt: "desc" },
        select: {
          id: true,
          title: true,
          body: true,
          createdAt: true,
        },
      }),
    ]);

  // --- Process compliance ---
  // Group certs by type, pick the latest expiry for each
  const certsByType = new Map<
    CertificateType,
    { expiryDate: Date; type: CertificateType }
  >();
  for (const cert of allCerts) {
    const existing = certsByType.get(cert.type);
    if (!existing || cert.expiryDate > existing.expiryDate) {
      certsByType.set(cert.type, {
        expiryDate: cert.expiryDate,
        type: cert.type,
      });
    }
  }

  const certs = REQUIRED_CERT_TYPES.map((type) => {
    const cert = certsByType.get(type);
    const expiryDate = cert?.expiryDate ?? null;
    const status = cert ? getCertStatus(expiryDate) : "missing";
    return {
      type,
      label: CERT_LABELS[type],
      expiryDate: expiryDate ? expiryDate.toISOString() : null,
      daysLeft: getDaysLeft(expiryDate),
      status,
    };
  });

  const validCount = certs.filter(
    (c) => c.status === "valid" || c.status === "expiring"
  ).length;
  const overallPct = Math.round((validCount / REQUIRED_CERT_TYPES.length) * 100);

  // --- Process todos ---
  const todoPending = todos.filter(
    (t) => t.status === "pending" || t.status === "in_progress"
  ).length;
  const todoComplete = todos.filter((t) => t.status === "complete").length;
  const todoOverdue = todos.filter(
    (t) =>
      (t.status === "pending" || t.status === "in_progress") &&
      new Date(t.dueDate) < now
  ).length;

  // --- Process training ---
  const trainingTotal = enrollments.length;
  const trainingCompleted = enrollments.filter(
    (e) => e.status === "completed"
  ).length;
  const trainingInProgress = enrollments.filter(
    (e) => e.status === "in_progress"
  ).length;
  const trainingPct =
    trainingTotal > 0
      ? Math.round((trainingCompleted / trainingTotal) * 100)
      : 0;

  return NextResponse.json({
    compliance: {
      overallPct,
      certs,
    },
    todos: {
      total: todos.length,
      pending: todoPending,
      complete: todoComplete,
      overdue: todoOverdue,
    },
    training: {
      total: trainingTotal,
      completed: trainingCompleted,
      inProgress: trainingInProgress,
      pct: trainingPct,
    },
    upcomingMeetings: meetings.map((m) => ({
      id: m.id,
      title: m.title,
      date: m.date.toISOString(),
    })),
    unreadAnnouncements: unreadAnnouncements.map((a) => ({
      id: a.id,
      title: a.title,
      createdAt: a.createdAt.toISOString(),
      content: a.body,
    })),
  });
}
