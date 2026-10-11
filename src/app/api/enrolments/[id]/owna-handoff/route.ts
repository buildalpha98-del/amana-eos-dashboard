import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertEnrolmentAccess } from "@/lib/enrolment-access";
import {
  applyHandoff,
  handoffPatchSchema,
  placementKey,
  readHandoff,
} from "@/lib/owna-handoff";

const include = {
  childRecords: {
    select: {
      id: true,
      serviceId: true,
      status: true,
      firstName: true,
      surname: true,
      service: { select: { name: true } },
    },
  },
  ownaHandoff: true,
} as const;
export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  const e = await prisma.enrolmentSubmission.findUnique({
    where: { id },
    include,
  });
  if (!e) throw ApiError.notFound("Enrolment not found");
  assertEnrolmentAccess(session, e.serviceId);
  for (const child of e.childRecords)
    assertEnrolmentAccess(session, child.serviceId);
  const history = await prisma.activityLog.findMany({
    where: { entityType: "EnrolmentOwnaHandoff", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      createdAt: true,
      details: true,
      user: { select: { name: true } },
    },
  });
  return NextResponse.json({
    scope: e.childRecords
      .map(
        (c) =>
          `${c.firstName} ${c.surname} — ${c.service?.name ?? "Unassigned service"}`,
      )
      .join("; "),
    revision: e.ownaHandoff?.revision ?? 0,
    state: readHandoff(e.ownaHandoff?.state),
    placement: placementKey(e),
    history,
  });
});

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const parsed = handoffPatchSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success)
    throw ApiError.badRequest(parsed.error.issues[0].message);
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const e = await tx.enrolmentSubmission.findUnique({
          where: { id },
          include,
        });
        if (!e) throw ApiError.notFound("Enrolment not found");
        assertEnrolmentAccess(session, e.serviceId);
        for (const child of e.childRecords)
          assertEnrolmentAccess(session, child.serviceId);
        if (
          e.status !== "processed" ||
          !e.serviceId ||
          !e.childRecords.length ||
          e.childRecords.some((c) => !c.serviceId || c.status !== "active")
        )
          throw ApiError.badRequest(
            "Confirm the enrolment and assign all children to services with active child records first.",
          );
        const current = e.ownaHandoff;
        if ((current?.revision ?? 0) !== parsed.data.revision)
          throw new ApiError(
            409,
            "Someone updated this handoff. Reload before saving.",
          );
        const placement = placementKey(e);
        const state = readHandoff(current?.state);
        if (current && !state)
          throw ApiError.badRequest("Handoff data needs administrator review.");
        let next;
        const by = {
          id: session.user.id,
          name: session.user.name || "Staff member",
        };
        try {
          next = applyHandoff(
            state ?? { placement, owner: null, note: "", steps: {} },
            parsed.data,
            by,
            placement,
            new Date().toISOString(),
          );
        } catch (err) {
          throw ApiError.badRequest((err as Error).message);
        }
        if (current) {
          const changed = await tx.enrolmentOwnaHandoff.updateMany({
            where: { enrolmentId: id, revision: parsed.data.revision },
            data: {
              state: next as Prisma.InputJsonValue,
              revision: { increment: 1 },
            },
          });
          if (changed.count !== 1)
            throw new ApiError(
              409,
              "Someone updated this handoff. Reload before saving.",
            );
        } else {
          await tx.enrolmentOwnaHandoff.create({
            data: { enrolmentId: id, state: next as Prisma.InputJsonValue },
          });
        }
        await tx.activityLog.create({
          data: {
            userId: session.user.id,
            entityType: "EnrolmentOwnaHandoff",
            entityId: id,
            action: "owna_handoff_updated",
            details: {
              ...parsed.data,
              by,
              previous: state,
              next,
            } as Prisma.InputJsonValue,
          },
        });
        return { revision: parsed.data.revision + 1, state: next };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json(result);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(err.code)
    )
      throw new ApiError(
        409,
        "Someone updated this handoff. Reload before saving.",
      );
    throw err;
  }
});
