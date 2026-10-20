import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertEnrolmentAccess } from "@/lib/enrolment-access";
import {
  HANDOFF_OWNER_ROLES,
  applyHandoff,
  handoffPatchSchema,
  isCoordinationAction,
  placementKey,
  predatesOwnaChecklist,
  readHandoff,
} from "@/lib/owna-handoff";
import { runAfter } from "@/lib/run-after";
import { onHandoffStepCompleted } from "@/lib/owna-handover";

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
  // Who the handoff can be assigned to (owner dropdown).
  const assignees = await prisma.user.findMany({
    where: { active: true, role: { in: [...HANDOFF_OWNER_ROLES] }, isCentreAccount: false },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    assignees,
    scope: e.childRecords
      .map(
        (c) =>
          `${c.firstName} ${c.surname} — ${c.service?.name ?? "Unassigned service"}`,
      )
      .join("; "),
    revision: e.ownaHandoff?.revision ?? 0,
    state: readHandoff(e.ownaHandoff?.state),
    placement: placementKey(e),
    /** Submitted before the checklist started: counts as done, never emails. */
    legacy: predatesOwnaChecklist(e.createdAt),
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
        // Owner / next action can be set while awaiting approval; checklist
        // ticks need a processed, placed enrolment (they email the family).
        if (
          !isCoordinationAction(parsed.data.action) &&
          (e.status !== "processed" ||
          !e.serviceId ||
          !e.childRecords.length ||
          e.childRecords.some((c) => !c.serviceId || c.status !== "active"))
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
        let assignee: { id: string; name: string } | undefined;
        if (parsed.data.action === "assign") {
          const u = await tx.user.findFirst({
            where: {
              id: parsed.data.ownerId,
              active: true,
              role: { in: [...HANDOFF_OWNER_ROLES] },
              isCentreAccount: false,
            },
            select: { id: true, name: true },
          });
          if (!u) throw ApiError.badRequest("That person can't own a handoff — choose an owner, head office or admin.");
          assignee = { id: u.id, name: u.name || "Staff member" };
        }
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
            assignee,
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
        return { revision: parsed.data.revision + 1, state: next, legacy: predatesOwnaChecklist(e.createdAt) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    // 2026-10-16: ticking "invitation" or "sessions" emails the family the
    // next step (OWNA setup guide / first day confirmed) — after commit,
    // unless staff untick "Email the family".
    const { action, step, notifyFamily } = parsed.data;
    const done = step ? result.state.steps[step] : undefined;
    // Families from before the checklist started are never emailed.
    if (action === "complete" && step && done && notifyFamily !== false && !result.legacy) {
      runAfter(() => onHandoffStepCompleted(id, step, done));
    }
    return NextResponse.json({ revision: result.revision, state: result.state });
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
