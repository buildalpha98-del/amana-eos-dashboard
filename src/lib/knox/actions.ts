import type { PrismaClient, TriageSubjectType } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { NOTIFIABLE_REASONS } from "@/lib/complaint-reference";
import {
  complaintPatchSchema,
  updateComplaintRecord,
  type ComplaintPatch,
} from "@/lib/complaints/update-complaint-record";
import { SERIOUS_INCIDENT_CATEGORIES } from "@/lib/compliance-clocks";
import {
  incidentPatchSchema,
  updateIncidentRecord,
  type IncidentPatch,
} from "@/lib/incidents/update-incident-record";
import { severityRank } from "@/lib/knox/cards";
import { enqueueTriage } from "@/lib/knox/enqueue";
import { resolveRecipients } from "@/lib/knox/recipients";
import { logger } from "@/lib/logger";
import { getWeekStart } from "@/lib/utils";

/**
 * Knox never writes to a register itself. After an assessment it proposes
 * changes as `PendingAction` rows ("cards"); a person approves or dismisses
 * them. `buildCards` decides what to propose (pure). `approvePendingAction`
 * re-validates the stored payload and writes through the SAME helpers the
 * forms use, so a card can never do something a form could not.
 */

export {
  CARD_TTL_MS,
  buildCards,
  toPendingActionCreate,
  type Card,
  type CardKind,
} from "@/lib/knox/cards";

const DAY_MS = 86_400_000;

/** Kinds that change the register row itself, and so deserve a re-triage. */
const WRITE_KINDS: ReadonlySet<string> = new Set([
  "set_severity",
  "mark_reportable",
  "mark_notifiable",
]);

export class PendingActionGone extends Error {
  constructor(message = "This card has expired or already been actioned") {
    super(message);
    this.name = "PendingActionGone";
  }
}

export class PendingActionHidden extends Error {
  constructor(message = "Card not found") {
    super(message);
    this.name = "PendingActionHidden";
  }
}

// ── Payload validation (approve-time) ────────────────────────────────

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Not a valid date");
const categoryValues = SERIOUS_INCIDENT_CATEGORIES.map((c) => c.value) as [string, ...string[]];
const reasonValues = NOTIFIABLE_REASONS.map((r) => r.value) as [string, ...string[]];

/**
 * Each kind is pinned to exactly the fields Knox proposes (`.strict()`), so a
 * tampered card cannot smuggle in another field the wider helper schema would
 * accept (`description`, `shareWithParent`, …). The helper schema then
 * validates the same value again, as the forms' routes do.
 */
const KIND_SCHEMAS = {
  set_severity: z.object({ severity: z.enum(["moderate", "serious", "reportable"]) }).strict(),
  mark_reportable: z
    .object({
      reportableToAuthority: z.literal(true),
      seriousIncidentCategory: z.enum(categoryValues),
      becameAwareAt: isoDate,
    })
    .strict(),
  mark_notifiable: z
    .object({
      notifiable: z.literal(true),
      notifiableReason: z.enum(reasonValues),
      becameAwareAt: isoDate,
    })
    .strict(),
  create_followup_todos: z
    .object({
      todos: z
        .array(
          z.object({
            title: z.string().trim().min(3).max(140),
            dueInDays: z.number().int().min(1).max(30),
          }),
        )
        .min(1)
        .max(4),
    })
    .strict(),
} as const;

type ValidatedCard =
  | { kind: "set_severity" | "mark_reportable"; incidentId: string; patch: IncidentPatch }
  | { kind: "mark_notifiable"; complaintId: string; patch: ComplaintPatch }
  | { kind: "create_followup_todos"; todos: { title: string; dueInDays: number }[] };

function invalid(message: string, details?: unknown): ApiError {
  return ApiError.badRequest(message, details);
}

function validateCard(card: {
  kind: string;
  subjectType: TriageSubjectType | null;
  subjectId: string | null;
  payload: unknown;
}): ValidatedCard {
  switch (card.kind) {
    case "set_severity":
    case "mark_reportable": {
      const parsed = KIND_SCHEMAS[card.kind].safeParse(card.payload);
      if (!parsed.success) throw invalid("This card's changes are no longer valid", parsed.error.flatten());
      const patch = incidentPatchSchema.safeParse(parsed.data);
      if (!patch.success) throw invalid("This card's changes are no longer valid", patch.error.flatten());
      if (card.subjectType !== "incident" || !card.subjectId) throw invalid("Card has no incident to update");
      return { kind: card.kind, incidentId: card.subjectId, patch: patch.data };
    }
    case "mark_notifiable": {
      const parsed = KIND_SCHEMAS.mark_notifiable.safeParse(card.payload);
      if (!parsed.success) throw invalid("This card's changes are no longer valid", parsed.error.flatten());
      const patch = complaintPatchSchema.safeParse(parsed.data);
      if (!patch.success) throw invalid("This card's changes are no longer valid", patch.error.flatten());
      if (card.subjectType !== "complaint" || !card.subjectId) throw invalid("Card has no complaint to update");
      return { kind: "mark_notifiable", complaintId: card.subjectId, patch: patch.data };
    }
    case "create_followup_todos": {
      const parsed = KIND_SCHEMAS.create_followup_todos.safeParse(card.payload);
      if (!parsed.success) throw invalid("This card's to-dos are no longer valid", parsed.error.flatten());
      return { kind: "create_followup_todos", todos: parsed.data.todos };
    }
    default:
      throw invalid(`Unknown card kind: ${card.kind}`);
  }
}

// ── Executors ────────────────────────────────────────────────────────

/** Load a card the actor may see. Unknown and out-of-scope look identical. */
async function loadVisibleCard(
  db: PrismaClient,
  id: string,
  actor: { serviceIds: string[] | null },
) {
  const card = await db.pendingAction.findUnique({ where: { id } });
  if (!card) throw new PendingActionHidden();
  if (actor.serviceIds !== null && (!card.serviceId || !actor.serviceIds.includes(card.serviceId))) {
    throw new PendingActionHidden();
  }
  return card;
}

function assertLive(
  card: { committedAt: Date | null; dismissedAt: Date | null; expiresAt: Date },
  now: Date,
): void {
  if (card.committedAt || card.dismissedAt || card.expiresAt.getTime() <= now.getTime()) {
    throw new PendingActionGone();
  }
}

/**
 * Approve a card: re-validate its payload, write through the shared helper,
 * stamp the card and log it, all in one transaction. A card can be claimed
 * once (conditional update), so two approvers cannot both write.
 *
 * Returns the created/updated record id and, for the three kinds that edit a
 * register row, the id of a re-triage job (the route runs it after the
 * response). Helper rule violations (`ApiError`) propagate unchanged.
 */
export async function approvePendingAction(
  db: PrismaClient,
  id: string,
  actor: { id: string; role: string; serviceIds: string[] | null },
  now: Date = new Date(),
): Promise<{ resultId: string; jobId: string | null }> {
  const card = await loadVisibleCard(db, id, actor);
  assertLive(card, now);
  const action = validateCard(card);

  // Resolved before the transaction: it takes the top-level client.
  let assigneeId: string | null = null;
  if (action.kind === "create_followup_todos" && card.serviceId) {
    const service = await db.service.findUnique({
      where: { id: card.serviceId },
      select: { id: true, name: true, state: true, managerId: true },
    });
    if (service) {
      const recipients = await resolveRecipients(db, service);
      assigneeId = recipients.directors[0]?.id ?? recipients.stateManagers[0]?.id ?? null;
    }
  }

  const resultId = await db.$transaction(async (tx) => {
    const claim = await tx.pendingAction.updateMany({
      where: { id, committedAt: null, dismissedAt: null, expiresAt: { gt: now } },
      data: { committedAt: now, committedById: actor.id },
    });
    if (claim.count === 0) throw new PendingActionGone();

    let result: string;
    switch (action.kind) {
      case "set_severity":
      case "mark_reportable": {
        if (action.kind === "set_severity") {
          // The ratchet holds at approve time too: someone may have raised
          // the severity since the card was proposed.
          const current = await tx.incidentRecord.findUnique({
            where: { id: action.incidentId },
            select: { severity: true },
          });
          if (!current) throw ApiError.notFound("Incident not found");
          if (severityRank(action.patch.severity) <= severityRank(current.severity)) {
            throw ApiError.conflict(`Severity is already ${current.severity}; Knox never lowers it`);
          }
        }
        const updated = await updateIncidentRecord(tx, action.incidentId, action.patch, { id: actor.id });
        result = updated.id;
        break;
      }
      case "mark_notifiable": {
        const existing = await tx.complaintRecord.findUnique({
          where: { id: action.complaintId },
          select: { notifiable: true, becameAwareAt: true },
        });
        if (!existing) throw ApiError.notFound("Complaint not found");
        const updated = await updateComplaintRecord(tx, action.complaintId, action.patch, { id: actor.id }, existing);
        result = updated.id;
        break;
      }
      case "create_followup_todos": {
        const ids: string[] = [];
        for (const item of action.todos) {
          const dueDate = new Date(now.getTime() + item.dueInDays * DAY_MS);
          const todo = await tx.todo.create({
            data: {
              title: item.title,
              dueDate,
              weekOf: getWeekStart(dueDate),
              assigneeId,
              serviceId: card.serviceId,
              createdById: actor.id,
              status: "pending",
            },
            select: { id: true },
          });
          ids.push(todo.id);
        }
        result = ids[0];
        break;
      }
    }

    await tx.pendingAction.update({ where: { id }, data: { resultId: result } });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        action: "knox.approved",
        entityType: "PendingAction",
        entityId: id,
        details: {
          kind: card.kind,
          summary: card.summary,
          assessmentId: card.assessmentId,
          resultId: result,
        },
      },
    });
    return result;
  });

  // After the commit, on the top-level client (enqueueTriage's contract).
  let jobId: string | null = null;
  if (WRITE_KINDS.has(card.kind) && card.subjectType && card.subjectId && card.serviceId) {
    jobId = await enqueueTriage(db, {
      subjectType: card.subjectType,
      subjectId: card.subjectId,
      serviceId: card.serviceId,
      reason: "updated",
    });
  }

  logger.info("Knox: card approved", { cardId: id, kind: card.kind, resultId, jobId, actorId: actor.id });
  return { resultId, jobId };
}

export async function dismissPendingAction(
  db: PrismaClient,
  id: string,
  actor: { id: string; serviceIds: string[] | null },
  reason?: string,
  now: Date = new Date(),
): Promise<void> {
  const card = await loadVisibleCard(db, id, actor);
  assertLive(card, now);

  await db.$transaction(async (tx) => {
    const claim = await tx.pendingAction.updateMany({
      where: { id, committedAt: null, dismissedAt: null, expiresAt: { gt: now } },
      data: { dismissedAt: now, dismissedById: actor.id, dismissReason: reason ?? null },
    });
    if (claim.count === 0) throw new PendingActionGone();

    await tx.activityLog.create({
      data: {
        userId: actor.id,
        action: "knox.dismissed",
        entityType: "PendingAction",
        entityId: id,
        details: {
          kind: card.kind,
          summary: card.summary,
          assessmentId: card.assessmentId,
          reason: reason ?? null,
        },
      },
    });
  });

  logger.info("Knox: card dismissed", { cardId: id, kind: card.kind, actorId: actor.id });
}
