import { randomUUID } from "node:crypto";
import { Prisma, type StatementDelivery } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { encryptField, decryptField } from "@/lib/field-encryption";
import { prepareStatementIssuedEmail } from "@/lib/notifications/billing";
import { sendEmail } from "@/lib/email";
import { generateStatementPdf } from "@/lib/billing/statement-pdf";
import { logger } from "@/lib/logger";

export const DELIVERY_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const LEASE_MS = 2 * 60 * 1000;
const MAX_AUTO_ATTEMPTS = 5;
const activeStatement = { status: { notIn: ["draft", "void"] as ("draft" | "void")[] } };
const payloadSchema = z.object({ from: z.string().min(1), to: z.array(z.string().email()).length(1), subject: z.string().min(1), html: z.string().min(1) }).strict();
const retryableCodes = ["PDF_FAILED", "PROVIDER_TRANSIENT", "PROVIDER_UNCONFIRMED"];

function withinWindow(job: Pick<StatementDelivery, "firstSendStartedAt">, now = new Date()) {
  return !job.firstSendStartedAt || now.getTime() < job.firstSendStartedAt.getTime() + DELIVERY_RETRY_WINDOW_MS;
}

/** Only these explicit fields may cross the staff API boundary. */
export function deliverySummary(job: Pick<StatementDelivery, "status" | "attemptCount" | "nextAttemptAt" | "sentAt" | "lastErrorCode" | "firstSendStartedAt"> | null, statementStatus: string) {
  if (!job) return null;
  const expiredFailure = job.status === "failed" && !withinWindow(job);
  const canRetry = statementStatus !== "draft" && statementStatus !== "void" && job.status === "failed" && retryableCodes.includes(job.lastErrorCode ?? "") && withinWindow(job);
  return { status: statementStatus === "void" && job.status !== "sent" ? "cancelled" : expiredFailure ? "needs_review" : job.status, attemptCount: job.attemptCount, nextAttemptAt: expiredFailure ? null : job.nextAttemptAt, sentAt: job.sentAt, errorCode: expiredFailure ? "RETRY_WINDOW_EXPIRED" : job.lastErrorCode, canRetry };
}

function fence(id: string, token: string, requireActive = true) {
  return { id, status: "processing" as const, leaseToken: token, leaseExpiresAt: { gt: new Date() }, ...(requireActive ? { statement: activeStatement } : {}) };
}

async function finish(id: string, token: string, status: "sent" | "failed" | "blocked" | "needs_review" | "cancelled", code: string | null, extra: Prisma.StatementDeliveryUpdateManyMutationInput = {}) {
  // Completion after provider acceptance records the truth even if the invoice
  // was voided during the external request; it never changes invoice status.
  return prisma.statementDelivery.updateMany({ where: fence(id, token, false), data: { status, lastErrorCode: code, nextAttemptAt: null, leaseToken: null, leaseExpiresAt: null, ...extra } });
}

async function fail(job: StatementDelivery, token: string, code: string, transient: boolean) {
  if (!withinWindow(job)) return finish(job.id, token, "needs_review", "RETRY_WINDOW_EXPIRED");
  const delay = Math.min(60, 2 ** Math.max(0, job.attemptCount - 1)) * 60_000;
  const next = new Date(Date.now() + delay);
  const automatic = transient && job.attemptCount < MAX_AUTO_ATTEMPTS && withinWindow(job, next);
  return finish(job.id, token, transient ? "failed" : "blocked", code, { nextAttemptAt: automatic ? next : null });
}

async function bounded<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("PDF_TIMEOUT")), ms); })]); }
  finally { clearTimeout(timer); }
}

/** A single worker shared by immediate processing, cron and authorized retry. */
export async function processStatementDelivery(statementId: string): Promise<void> {
  const token = randomUUID(), now = new Date();
  const claimed = await prisma.statementDelivery.updateMany({
    where: { statementId, OR: [
      { status: "pending", nextAttemptAt: { lte: now } },
      { status: "failed", nextAttemptAt: { lte: now } },
      { status: "processing", leaseExpiresAt: { lte: now } },
    ] },
    data: { status: "processing", leaseToken: token, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), nextAttemptAt: null, attemptCount: { increment: 1 } },
  });
  if (claimed.count !== 1) return;
  let job = await prisma.statementDelivery.findUniqueOrThrow({ where: { statementId } });
  try {
    const statement = await prisma.statement.findUniqueOrThrow({ where: { id: statementId }, select: { status: true } });
    if (statement.status === "void" || statement.status === "draft") { await finish(job.id, token, "cancelled", null); return; }
    if (!withinWindow(job)) { await finish(job.id, token, "needs_review", "RETRY_WINDOW_EXPIRED"); return; }

    if (!job.pdfUrl) {
      let url: string;
      try { url = await bounded(generateStatementPdf(statementId, { persist: false }), 30_000); }
      catch { await fail(job, token, "PDF_FAILED", true); return; }
      // A timed-out or superseded worker cannot replace either URL.
      const saved = await prisma.$transaction(async tx => {
        const result = await tx.statementDelivery.updateMany({ where: { ...fence(job.id, token), emailPayload: null }, data: { pdfUrl: url } });
        if (result.count !== 1) return false;
        const updated = await tx.statement.updateMany({ where: { id: statementId, ...activeStatement }, data: { pdfUrl: url } });
        if (updated.count !== 1) throw new Error("STATEMENT_CHANGED");
        return true;
      });
      if (!saved) return;
      job = { ...job, pdfUrl: url };
    }

    if (!job.emailPayload) {
      const payload = payloadSchema.parse(await prepareStatementIssuedEmail(statementId));
      const encrypted = encryptField(JSON.stringify(payload));
      const saved = await prisma.statementDelivery.updateMany({ where: { ...fence(job.id, token), emailPayload: null, firstSendStartedAt: null }, data: { emailPayload: encrypted } });
      if (saved.count !== 1) return;
      job = { ...job, emailPayload: encrypted };
    }
    if (!job.emailPayload) throw new Error("SNAPSHOT_UNAVAILABLE");
    const payload = payloadSchema.parse(JSON.parse(decryptField(job.emailPayload)));
    if (!process.env.RESEND_API_KEY) { await fail(job, token, "EMAIL_NOT_CONFIGURED", false); return; }

    // Persist BEFORE the first potentially accepted request. Never reset it.
    const firstSend = job.firstSendStartedAt ?? new Date();
    if (!withinWindow({ firstSendStartedAt: firstSend })) { await finish(job.id, token, "needs_review", "RETRY_WINDOW_EXPIRED"); return; }
    const allowed = await prisma.statementDelivery.updateMany({ where: fence(job.id, token), data: { firstSendStartedAt: firstSend } });
    if (allowed.count !== 1) return;
    job = { ...job, firstSendStartedAt: firstSend };
    if (!withinWindow(job) || !job.leaseExpiresAt || Date.now() >= job.leaseExpiresAt.getTime()) return;

    const result = await sendEmail(payload, { idempotencyKey: `statement-issued/${job.id}`, signal: AbortSignal.timeout(15_000) });
    if (result.messageId && result.sent.length === 1 && !result.failed) {
      // Save acceptance before best-effort notification logging. If this DB write
      // fails, the persisted payload/key recovers the same send within the window.
      await finish(job.id, token, "sent", null, { providerMessageId: result.messageId, sentAt: new Date() });
      try { await prisma.notificationLog.create({ data: { type: "statement_issued", recipientEmail: payload.to[0], subject: payload.subject, status: "sent", relatedId: statementId, relatedType: "Statement" } }); }
      catch { logger.warn("Statement delivery notification log unavailable", { statementId }); }
      return;
    }
    if (result.suppressed.length) {
      // Once a send was attempted, suppression does not disprove prior acceptance.
      await finish(job.id, token, "needs_review", "RECIPIENT_SUPPRESSED"); return;
    }
    const name = result.failed?.name;
    const transient = !result.failed?.statusCode || result.failed.statusCode >= 500 || result.failed.statusCode === 429 || name === "concurrent_idempotent_requests";
    await fail(job, token, result.failed ? transient ? "PROVIDER_TRANSIENT" : "PROVIDER_REJECTED" : "PROVIDER_UNCONFIRMED", transient);
  } catch (error) {
    const code = error instanceof Error && error.message === "MISSING_RECIPIENT" ? "MISSING_RECIPIENT" : "PROCESSING_FAILED";
    // Never log the frozen payload, recipient or raw provider/database exception.
    logger.error("Statement delivery processing failed", { statementId, code });
    if (code === "MISSING_RECIPIENT") await fail(job, token, code, false);
    else if (!job.firstSendStartedAt) await fail(job, token, code, false);
    // Unknown failures can include acceptance followed by DB failure. Keep the
    // lease for crash recovery using the original provider key and payload.
  }
}

export async function retryStatementDelivery(statementId: string, userId: string) {
  return prisma.$transaction(async tx => {
    const job = await tx.statementDelivery.findUnique({ where: { statementId }, include: { statement: { select: { status: true } } } });
    if (!job) throw ApiError.badRequest("Delivery was not tracked for this statement");
    if (!deliverySummary(job, job.statement.status)?.canRetry) throw ApiError.conflict("Delivery cannot be safely retried; review its status");
    const updated = await tx.statementDelivery.updateMany({ where: { id: job.id, status: "failed", lastErrorCode: { in: retryableCodes }, updatedAt: job.updatedAt, statement: activeStatement }, data: { status: "pending", nextAttemptAt: new Date(), leaseToken: null, leaseExpiresAt: null } });
    if (updated.count !== 1) throw ApiError.conflict("Delivery changed; reload before retrying");
    await tx.activityLog.create({ data: { userId, action: "retry_statement_delivery", entityType: "Statement", entityId: statementId } });
  });
}

export async function processPendingStatementDeliveries() {
  const now = new Date();
  const jobs = await prisma.statementDelivery.findMany({ where: { OR: [{ status: { in: ["pending", "failed"] }, nextAttemptAt: { lte: now } }, { status: "processing", leaseExpiresAt: { lte: now } }] }, select: { statementId: true }, orderBy: { createdAt: "asc" }, take: 3 });
  await Promise.all(jobs.map(job => processStatementDelivery(job.statementId)));
  return jobs.length;
}
