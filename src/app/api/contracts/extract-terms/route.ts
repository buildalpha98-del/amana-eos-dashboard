/**
 * POST /api/contracts/extract-terms
 *
 * Reads a contract document and SUGGESTS the employment terms it contains —
 * pay rate first and foremost, plus hours, contract type, classification and
 * dates. Nothing is written: the response is a proposal an admin reviews.
 *
 * Two input shapes, both admin-only:
 *
 *   multipart/form-data  `file`        — a document being uploaded, read
 *                                        before it is stored, so abandoning
 *                                        the review leaves no blob behind
 *   application/json     `contractId`  — an existing contract, read from its
 *                                        stored document. This is the
 *                                        backfill path for the rows
 *                                        quick-upload created with payRate 0
 *
 * Rate-limited hard (10/5min): each call is a model invocation over a whole
 * contract, and there is no reason for an admin to need more.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { extractContractTerms } from "@/lib/contracts/extract-terms";

const MAX_SIZE = 10 * 1024 * 1024; // matches /api/contracts/quick-upload

const SUPPORTED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export const POST = withApiAuth(
  async (req, session) => {
    const contentType = req.headers.get("content-type") ?? "";

    let buffer: Buffer | undefined;
    let fileUrl: string | undefined;
    let mimeType: string;
    let contractId: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        throw ApiError.badRequest("Missing file");
      }
      if (file.size === 0) throw ApiError.badRequest("File is empty");
      if (file.size > MAX_SIZE) {
        throw ApiError.badRequest("File too large (max 10 MB)");
      }
      mimeType = file.type || "application/pdf";
      if (!SUPPORTED_MIMES.has(mimeType)) {
        throw ApiError.badRequest(
          "Unsupported file type — PDF, DOCX or plain text only.",
        );
      }
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      const body = (await req.json().catch(() => null)) as {
        contractId?: string;
      } | null;
      if (!body?.contractId) {
        throw ApiError.badRequest(
          "Send either a multipart `file` or a JSON `contractId`.",
        );
      }
      contractId = body.contractId;

      const contract = await prisma.employmentContract.findUnique({
        where: { id: contractId },
        select: { id: true, documentUrl: true },
      });
      if (!contract) throw ApiError.notFound("Contract not found");
      if (!contract.documentUrl) {
        throw ApiError.badRequest(
          "This contract has no document attached, so there's nothing to read.",
        );
      }
      fileUrl = contract.documentUrl;
      // Contracts are stored as rendered or uploaded PDFs.
      mimeType = "application/pdf";
    }

    try {
      const terms = await extractContractTerms({ buffer, fileUrl, mimeType });

      logger.info("Contract terms extracted", {
        userId: session!.user.id,
        contractId,
        confidence: terms.confidence,
        foundPayRate: terms.payRate !== null,
      });

      return NextResponse.json({ terms });
    } catch (err) {
      // A model outage or an unreadable document must not look like a bug in
      // the upload flow — the admin can always type the values in.
      logger.error("Contract term extraction failed", { contractId, err });
      throw new ApiError(
        502,
        "Couldn't read the contract automatically. Enter the details manually and carry on.",
      );
    }
  },
  {
    roles: ["owner", "head_office", "admin"],
    rateLimit: { max: 10, windowMs: 5 * 60_000 },
  },
);
