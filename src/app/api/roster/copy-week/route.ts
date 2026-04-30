import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { z } from "zod";

// ---------------------------------------------------------------------------
// POST /api/roster/copy-week
// Duplicates a source week of shifts into a target week. For each source
// shift, we compute targetDate = sourceDate + (targetStart - sourceStart)
// days, then look up the composite-unique target cell:
//   (serviceId, date, staffName, shiftStart)
//   - no collision  → create as draft
//   - draft exists  → delete-then-create (replaced)
//   - published     → skip, report in `skipped` array
// ---------------------------------------------------------------------------

const copyWeekSchema = z.object({
  serviceId: z.string().min(1),
  sourceWeekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetWeekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type SkippedEntry = {
  date: string;
  sessionType: string;
  staffName: string;
  reason: string;
};

export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = copyWeekSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }
  const { serviceId, sourceWeekStart, targetWeekStart } = parsed.data;

  const role = session.user.role ?? "";
  if (!isAdminRole(role)) {
    if (role !== "member" || session.user.serviceId !== serviceId) {
      throw ApiError.forbidden();
    }
  }

  const sourceStart = new Date(sourceWeekStart);
  const sourceEnd = new Date(sourceStart);
  sourceEnd.setDate(sourceEnd.getDate() + 7);
  const targetStart = new Date(targetWeekStart);

  const dayOffsetMs =
    targetStart.getTime() - sourceStart.getTime();

  const sourceShifts = await prisma.rosterShift.findMany({
    where: {
      serviceId,
      date: { gte: sourceStart, lt: sourceEnd },
    },
    orderBy: [{ date: "asc" }, { shiftStart: "asc" }],
  });

  const result = await prisma.$transaction(async (tx) => {
    let created = 0;
    let replaced = 0;
    const skipped: SkippedEntry[] = [];

    for (const src of sourceShifts) {
      const targetDate = new Date(src.date.getTime() + dayOffsetMs);
      const targetDateIso = targetDate.toISOString().slice(0, 10);

      const collision = await tx.rosterShift.findUnique({
        where: {
          serviceId_date_staffName_shiftStart: {
            serviceId,
            date: targetDate,
            staffName: src.staffName,
            shiftStart: src.shiftStart,
          },
        },
      });

      if (collision) {
        if (collision.status === "published") {
          skipped.push({
            date: targetDateIso,
            sessionType: src.sessionType,
            staffName: src.staffName,
            reason: "target cell already published",
          });
          continue;
        }
        // Draft collision → delete-then-create.
        await tx.rosterShift.delete({ where: { id: collision.id } });
        await tx.rosterShift.create({
          data: {
            serviceId,
            userId: src.userId,
            staffName: src.staffName,
            date: targetDate,
            sessionType: src.sessionType,
            shiftStart: src.shiftStart,
            shiftEnd: src.shiftEnd,
            role: src.role,
            status: "draft",
            createdById: session.user.id,
          },
        });
        replaced++;
        continue;
      }

      // No collision → create new draft.
      await tx.rosterShift.create({
        data: {
          serviceId,
          userId: src.userId,
          staffName: src.staffName,
          date: targetDate,
          sessionType: src.sessionType,
          shiftStart: src.shiftStart,
          shiftEnd: src.shiftEnd,
          role: src.role,
          status: "draft",
          createdById: session.user.id,
        },
      });
      created++;
    }

    return { created, replaced, skipped };
  });

  return NextResponse.json(result);
});
