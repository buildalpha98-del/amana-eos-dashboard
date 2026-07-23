/**
 * GET  /api/family-balance-contacts — list contacts, newest first
 * POST /api/family-balance-contacts — log a new contact attempt
 *
 * Purpose: track parent contact attempts for outstanding balances.
 * When outcome = "no_answer", the endpoint auto-generates a Todo
 * (assigned to the creator, due tomorrow) so the follow-up is
 * always on someone's radar.
 *
 * Owner / head_office / admin / marketing only — this is a
 * financials/collections surface, not a general staff tool.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getWeekStart } from "@/lib/utils";

const CONTACT_METHODS = ["email", "phone", "sms", "in_person"] as const;
const CONTACT_OUTCOMES = [
  "answered",
  "no_answer",
  "promised_payment",
  "disputed",
  "payment_plan",
  "other",
] as const;

const createSchema = z.object({
  accountName: z.string().min(1).max(200),
  parentName: z.string().min(1).max(200),
  mobileNumber: z.string().max(50).optional().nullable(),
  amountOwing: z.number().nonnegative(),
  contactedAt: z.string().datetime().optional(),
  contactMethod: z.enum(CONTACT_METHODS),
  outcome: z.enum(CONTACT_OUTCOMES),
  outcomeNotes: z.string().max(5000).optional().nullable(),
  followUpDate: z.string().datetime().optional().nullable(),
  serviceId: z.string().optional().nullable(),
});

export const GET = withApiAuth(
  async (req) => {
    const url = new URL(req.url);
    const outcome = url.searchParams.get("outcome");
    const serviceId = url.searchParams.get("serviceId");

    const parsedOutcome =
      outcome && (CONTACT_OUTCOMES as readonly string[]).includes(outcome)
        ? (outcome as (typeof CONTACT_OUTCOMES)[number])
        : undefined;

    const contacts = await prisma.familyBalanceContact.findMany({
      where: {
        ...(parsedOutcome ? { outcome: parsedOutcome } : {}),
        ...(serviceId ? { serviceId } : {}),
      },
      include: {
        service: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
        followUpTodo: { select: { id: true, status: true, dueDate: true } },
      },
      orderBy: { contactedAt: "desc" },
      take: 500,
    });

    return NextResponse.json({
      contacts: contacts.map((c) => ({
        ...c,
        amountOwing: Number(c.amountOwing),
      })),
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const data = parsed.data;
    const contactedAt = data.contactedAt ? new Date(data.contactedAt) : new Date();

    // When outcome = no_answer AND no explicit follow-up date supplied,
    // default to +1 day so a follow-up todo lands on tomorrow's list.
    // Admin can still override by picking a date in the form.
    const followUpDate =
      data.followUpDate != null
        ? new Date(data.followUpDate)
        : data.outcome === "no_answer"
          ? (() => {
              const d = new Date(contactedAt);
              d.setDate(d.getDate() + 1);
              return d;
            })()
          : null;

    const created = await prisma.$transaction(async (tx) => {
      const contact = await tx.familyBalanceContact.create({
        data: {
          accountName: data.accountName,
          parentName: data.parentName,
          mobileNumber: data.mobileNumber || null,
          amountOwing: data.amountOwing,
          contactedAt,
          contactMethod: data.contactMethod,
          outcome: data.outcome,
          outcomeNotes: data.outcomeNotes || null,
          followUpDate,
          serviceId: data.serviceId || null,
          createdById: session!.user.id,
        },
      });

      // Auto-todo when outcome = no_answer. Assigned to the admin who
      // logged the contact (they're the one chasing the balance), due
      // on the follow-up date. Linked back via followUpTodoId so the
      // contact row can navigate straight to the todo.
      if (data.outcome === "no_answer" && followUpDate) {
        const todo = await tx.todo.create({
          data: {
            title: `Follow up: ${data.parentName} — $${data.amountOwing.toFixed(2)} outstanding`,
            description: `Previous attempt on ${contactedAt.toLocaleDateString(
              "en-AU",
              { day: "numeric", month: "short", year: "numeric" },
            )} via ${data.contactMethod} — no answer. Account: ${data.accountName}${data.mobileNumber ? ` · ${data.mobileNumber}` : ""}`,
            assigneeId: session!.user.id,
            createdById: session!.user.id,
            dueDate: followUpDate,
            weekOf: getWeekStart(followUpDate),
            serviceId: data.serviceId || null,
          },
        });
        await tx.familyBalanceContact.update({
          where: { id: contact.id },
          data: { followUpTodoId: todo.id },
        });
        return { ...contact, followUpTodoId: todo.id };
      }

      return contact;
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "create",
        entityType: "FamilyBalanceContact",
        entityId: created.id,
        details: {
          parentName: data.parentName,
          amountOwing: data.amountOwing,
          outcome: data.outcome,
        },
      },
    });

    return NextResponse.json(
      { ...created, amountOwing: Number(created.amountOwing) },
      { status: 201 },
    );
  },
  { roles: ["owner", "head_office", "admin"] },
);
