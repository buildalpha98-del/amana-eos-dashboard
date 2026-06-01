/**
 * GET  /api/my-portal/expenses — own user's recent expense requests
 * POST /api/my-portal/expenses — submit a new expense (multipart)
 *
 * Both gated by `requireOwnEmployee`. EH always queues new expense
 * requests for manager approval — there's no auto-approve flag.
 *
 * Submit payload (multipart/form-data):
 *   - `data` (string, JSON):
 *       { description, expenseCategoryId, amount, dateIncurred, notes? }
 *   - `receipt` (file, optional): the receipt PDF/JPG/PNG. Max 10 MB.
 *
 * Flow on POST:
 *   1. Validate the JSON via zod
 *   2. createExpenseRequest in EH → get back the new request id
 *   3. If a receipt was uploaded, PUT it to .../attachment
 *   4. Return the final state (with attachments populated if any)
 *
 * If the attachment upload fails AFTER the request was created we
 * still return the created request — the staff member can see it
 * in their list and add the receipt manually via EH. Logging that
 * partial-success state surfaces it for monitoring.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import {
  isConfigured,
  listExpenseRequests,
  createExpenseRequest,
  attachExpenseReceipt,
  EhPayrollError,
} from "@/lib/eh-payroll";
import { requireOwnEmployee } from "@/lib/eh-payroll-auth";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

export const GET = withApiAuth(async (_req, session) => {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Payroll integration not configured" },
      { status: 503 },
    );
  }

  const employeeId = await requireOwnEmployee(session!);

  try {
    const requests = await listExpenseRequests(employeeId, 20);
    return NextResponse.json({ requests });
  } catch (err) {
    if (err instanceof EhPayrollError) {
      logger.warn("My Portal expenses list: EH failure", {
        employeeId,
        status: err.status,
      });
      return NextResponse.json(
        { error: `Could not fetch expenses (EH ${err.status})` },
        { status: 502 },
      );
    }
    throw err;
  }
});

// File size + content-type whitelist for the receipt upload.
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

const submitSchema = z.object({
  description: z.string().min(1).max(500),
  expenseCategoryId: z.number().int().positive(),
  amount: z.number().positive().max(100_000), // sanity cap; EH would reject lower anyway
  dateIncurred: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid dateIncurred"),
  notes: z.string().max(1000).optional(),
});

export const POST = withApiAuth(async (req, session) => {
  if (!isConfigured()) {
    throw ApiError.badRequest("Payroll integration not configured");
  }
  const employeeId = await requireOwnEmployee(session!);

  // Multipart parse — `data` field holds JSON, `receipt` field holds
  // the optional file. Same pattern as the existing
  // /api/compliance POST that handles cert uploads.
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw ApiError.badRequest(
      "Submit as multipart/form-data with a `data` JSON field and optional `receipt` file",
    );
  }

  const form = await req.formData();
  const dataStr = form.get("data");
  if (typeof dataStr !== "string") {
    throw ApiError.badRequest("Missing `data` field in multipart body");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(dataStr);
  } catch {
    throw ApiError.badRequest("`data` field is not valid JSON");
  }
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Validation failed",
      parsed.error.flatten().fieldErrors,
    );
  }

  // Sanity: dateIncurred can't be in the future. EH would reject too,
  // but a friendly 400 here gives the user the right cursor target.
  const today = new Date().toISOString().slice(0, 10);
  if (parsed.data.dateIncurred > today) {
    throw ApiError.badRequest(
      "Expense date can't be in the future — pick today or earlier.",
    );
  }

  // Receipt file (optional but strongly encouraged by the UI). Validate
  // size + content-type BEFORE creating the EH request so we don't
  // leave an orphaned request on a bad upload.
  const receipt = form.get("receipt");
  let receiptData: {
    buffer: ArrayBuffer;
    filename: string;
    contentType: string;
  } | null = null;
  if (receipt && typeof receipt !== "string" && (receipt as File).size > 0) {
    const file = receipt as File;
    if (file.size > MAX_RECEIPT_BYTES) {
      throw ApiError.badRequest(
        `Receipt too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`,
      );
    }
    const ct = file.type || "application/octet-stream";
    if (!ALLOWED_CONTENT_TYPES.has(ct.toLowerCase())) {
      throw ApiError.badRequest(
        `Receipt type not supported. Use PDF, JPG, PNG, HEIC, or WebP.`,
      );
    }
    receiptData = {
      buffer: await file.arrayBuffer(),
      filename: file.name || "receipt",
      contentType: ct,
    };
  }

  // Step 1: create the expense request in EH.
  let created;
  try {
    created = await createExpenseRequest(employeeId, parsed.data);
  } catch (err) {
    if (err instanceof EhPayrollError) {
      logger.warn("Expense submit: EH rejected create", {
        employeeId,
        status: err.status,
        body: err.body,
      });
      if (err.status >= 400 && err.status < 500) {
        const msg =
          typeof err.body === "string"
            ? err.body
            : `Payroll rejected this expense (EH ${err.status}). Check category and amount.`;
        throw ApiError.badRequest(msg);
      }
      throw new ApiError(502, `Payroll service responded ${err.status}`);
    }
    throw err;
  }

  // Step 2 (optional): upload the receipt. If this fails we still return
  // the created request — staff sees it in their list and can attach
  // manually via EH. Logging surfaces the partial-success state.
  if (receiptData) {
    try {
      const withAttachment = await attachExpenseReceipt(
        employeeId,
        created.id,
        receiptData,
      );
      return NextResponse.json(withAttachment, { status: 201 });
    } catch (err) {
      logger.error("Expense submit: receipt upload failed (request created)", {
        employeeId,
        expenseRequestId: created.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Return 207 Multi-Status semantics in spirit, but stick to a
      // standard 201 + a warning field so the client knows to surface
      // "uploaded but receipt didn't attach — try again from EH".
      return NextResponse.json(
        {
          ...created,
          warning:
            "Expense saved, but the receipt failed to upload. Add it manually in Employment Hero.",
        },
        { status: 201 },
      );
    }
  }

  return NextResponse.json(created, { status: 201 });
});
