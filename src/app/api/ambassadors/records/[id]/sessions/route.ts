import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import { assertRecordInScope } from "../../../_lib/scope";
import { recomputeAmbassadorRecord } from "@/lib/ambassadors/recompute";

/**
 * Director quick entry for paid sessions (attendance lives in OWNA and the
 * pilot centres aren't API-linked, so counts are entered here or via the
 * CSV import). Every change is audit-logged and triggers a recompute.
 *
 * POST   { sessions: [{ date: "YYYY-MM-DD", sessionType?, fee }] } — upserts
 * DELETE { sessionId } — removes one session
 */

const postSchema = z.object({
  sessions: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD dates"),
        sessionType: z.enum(["bsc", "asc", "vc", "unknown"]).default("unknown"),
        fee: z.number().min(0).max(500),
      }),
    )
    .min(1)
    .max(60),
});

async function loadScoped(
  id: string,
  session: Parameters<typeof assertRecordInScope>[1],
) {
  const record = await prisma.ambassadorEnrolment.findUnique({
    where: { id },
    select: { id: true, serviceId: true, creditedEducatorId: true, status: true },
  });
  if (!record) throw ApiError.notFound("Ambassador record not found");
  const { serviceIds } = await getCentreScope(session);
  assertRecordInScope(record, session, serviceIds);
  if (record.status === "sent_to_payroll" || record.status === "paid") {
    throw ApiError.badRequest(
      "Sessions are locked once a record has been sent to payroll.",
    );
  }
  return record;
}

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = (await context?.params) ?? {};
    if (!id) throw ApiError.badRequest("Missing record id");
    await loadScoped(id, session);

    const parsed = postSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }

    for (const s of parsed.data.sessions) {
      await prisma.ambassadorSession.upsert({
        where: {
          recordId_date_sessionType: {
            recordId: id,
            date: new Date(s.date),
            sessionType: s.sessionType,
          },
        },
        create: {
          recordId: id,
          date: new Date(s.date),
          sessionType: s.sessionType,
          fee: s.fee,
          source: "manual",
          createdById: session.user.id,
        },
        update: { fee: s.fee, createdById: session.user.id },
      });
    }

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "ambassador_sessions_entered",
        entityType: "AmbassadorEnrolment",
        entityId: id,
        details: { sessions: parsed.data.sessions },
      },
    });
    await recomputeAmbassadorRecord(id);

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);

const deleteSchema = z.object({ sessionId: z.string().min(1) });

export const DELETE = withApiAuth(
  async (req, session, context) => {
    const { id } = (await context?.params) ?? {};
    if (!id) throw ApiError.badRequest("Missing record id");
    await loadScoped(id, session);

    const parsed = deleteSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }

    const sessionRow = await prisma.ambassadorSession.findUnique({
      where: { id: parsed.data.sessionId },
      select: { id: true, recordId: true, date: true, fee: true },
    });
    if (!sessionRow || sessionRow.recordId !== id) {
      throw ApiError.notFound("Session not found");
    }

    await prisma.ambassadorSession.delete({ where: { id: sessionRow.id } });
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "ambassador_session_deleted",
        entityType: "AmbassadorEnrolment",
        entityId: id,
        details: { date: sessionRow.date, fee: sessionRow.fee },
      },
    });
    await recomputeAmbassadorRecord(id);

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
