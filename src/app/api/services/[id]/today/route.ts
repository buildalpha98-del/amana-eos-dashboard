import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/services/[id]/today — "Today" snapshot for a service centre
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  // Verify the service exists
  const service = await prisma.service.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const in30Days = new Date(today);
  in30Days.setDate(in30Days.getDate() + 30);

  // Run all queries in parallel
  const [attendanceRecords, staffOnDuty, todosToday, openTickets, expiringCerts] =
    await Promise.all([
      // Today's attendance records (all session types)
      prisma.dailyAttendance.findMany({
        where: {
          serviceId: id,
          date: today,
        },
        select: {
          sessionType: true,
          enrolled: true,
          attended: true,
          capacity: true,
        },
      }),

      // Staff assigned to this centre
      prisma.user.findMany({
        where: {
          serviceId: id,
          active: true,
        },
        select: {
          id: true,
          name: true,
          avatar: true,
        },
        orderBy: { name: "asc" },
      }),

      // Todos due today or overdue, not completed/cancelled
      prisma.todo.findMany({
        where: {
          serviceId: id,
          dueDate: { lte: today },
          status: { notIn: ["complete", "cancelled"] },
          deleted: false,
        },
        include: {
          assignee: { select: { name: true } },
        },
        orderBy: { dueDate: "asc" },
      }),

      // Recent open tickets (new or open status)
      prisma.supportTicket.findMany({
        where: {
          serviceId: id,
          status: { in: ["new", "open"] },
          deleted: false,
        },
        select: {
          id: true,
          subject: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),

      // Expiring compliance certificates (next 30 days)
      prisma.complianceCertificate.findMany({
        where: {
          serviceId: id,
          expiryDate: {
            gte: today,
            lte: in30Days,
          },
        },
        include: {
          user: { select: { name: true } },
        },
        orderBy: { expiryDate: "asc" },
      }),
    ]);

  // Build attendance map by session type
  const attendanceMap: Record<
    string,
    { enrolled: number; attended: number; capacity: number } | null
  > = {
    bsc: null,
    asc: null,
    vc: null,
  };

  for (const record of attendanceRecords) {
    attendanceMap[record.sessionType] = {
      enrolled: record.enrolled,
      attended: record.attended,
      capacity: record.capacity,
    };
  }

  // Format response
  const response = {
    attendance: attendanceMap,
    staffOnDuty: staffOnDuty.map((s) => ({
      id: s.id,
      name: s.name,
      avatar: s.avatar,
    })),
    todosToday: todosToday.map((t) => ({
      id: t.id,
      title: t.title,
      assigneeName: t.assignee.name,
      dueDate: t.dueDate.toISOString(),
      status: t.status,
    })),
    openTickets: openTickets.map((t) => ({
      id: t.id,
      title: t.subject || "No subject",
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    })),
    expiringCerts: expiringCerts.map((c) => {
      const daysLeft = Math.ceil(
        (c.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        id: c.id,
        userName: c.user?.name || "Unknown",
        type: c.type,
        expiryDate: c.expiryDate.toISOString(),
        daysLeft,
      };
    }),
  };

  return NextResponse.json(response);
}
