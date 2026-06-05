/**
 * POST /api/contracts/quick-upload  (multipart/form-data)
 *
 * Minimal "drag a PDF onto the staff profile" backfill flow. Skips
 * the metadata form entirely — admin attaches an already-signed
 * off-platform contract (EH-era PDF, paper scan, etc.) and we file
 * it on the staff record without forcing them to retype pay rate,
 * dates, or contract type. The PDF itself is the source of truth.
 *
 * Body:
 *   - `userId` (string, form field)
 *   - `file`   (PDF, form field)
 *
 * Behaviour:
 *   - Defaults `status` to "active", `acknowledgedByStaff=true`,
 *     `acknowledgedAt=signedAt=now`. This makes the row count for
 *     the /team "no contract" badge so it clears on upload.
 *   - Defaults `contractType` to ct_permanent, `payRate=0`,
 *     `startDate=today`. Admin can refine via the full form later.
 *   - Stamps `notes` with "Imported from existing PDF — see attached
 *     document for full terms" so future readers don't get confused
 *     by the placeholder pay rate.
 *
 * Auth: owner / head_office / admin only. Same role gate as the
 * full /api/contracts POST (which uses the contracts.create feature
 * flag — admin-tier).
 *
 * 2026-06-04.
 */

import { NextResponse } from "next/server";
import { ContractType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { uploadFile } from "@/lib/storage";
import { logger } from "@/lib/logger";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB — matches /api/upload and the
                                   // existing ContractFormFields uploader

export const POST = withApiAuth(
  async (req, session) => {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw ApiError.badRequest(
        "Expected multipart/form-data with userId + file fields.",
      );
    }

    const form = await req.formData();
    const userId = form.get("userId");
    const file = form.get("file");
    const contractTypeRaw = form.get("contractType");
    const payRateRaw = form.get("payRate");

    if (typeof userId !== "string" || !userId) {
      throw ApiError.badRequest("Missing userId");
    }
    if (!file || typeof file === "string") {
      throw ApiError.badRequest("Missing file");
    }

    // 2026-06-05: contractType + payRate are now admin-controllable
    // on the dropzone. Both stay optional with sensible defaults so
    // the one-click "just attach the PDF" path still works.
    const allowedTypes: ContractType[] = [
      ContractType.ct_permanent,
      ContractType.ct_part_time,
      ContractType.ct_casual,
      ContractType.ct_fixed_term,
    ];
    let contractType: ContractType = ContractType.ct_permanent;
    if (typeof contractTypeRaw === "string" && contractTypeRaw) {
      const candidate = contractTypeRaw as ContractType;
      if (!allowedTypes.includes(candidate)) {
        throw ApiError.badRequest(
          `Invalid contractType — expected one of ${allowedTypes.join(", ")}`,
        );
      }
      contractType = candidate;
    }
    let payRate = 0;
    if (typeof payRateRaw === "string" && payRateRaw.trim()) {
      const parsed = Number(payRateRaw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw ApiError.badRequest(
          "Pay rate must be a non-negative number.",
        );
      }
      payRate = parsed;
    }

    const fileObj = file as File;
    if (fileObj.type !== "application/pdf") {
      throw ApiError.badRequest("PDF files only");
    }
    if (fileObj.size === 0) {
      throw ApiError.badRequest("File is empty");
    }
    if (fileObj.size > MAX_SIZE) {
      throw ApiError.badRequest(
        `File too large (max ${MAX_SIZE / 1024 / 1024} MB)`,
      );
    }

    // Confirm the target user exists before we burn a blob upload.
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
    if (!targetUser) {
      throw ApiError.notFound("Staff member not found");
    }

    // Upload the PDF to Blob storage. Folder per-user so the
    // contracts namespace stays organised.
    const buffer = Buffer.from(await fileObj.arrayBuffer());
    const uploaded = await uploadFile(buffer, fileObj.name, {
      contentType: fileObj.type,
      folder: `contracts/imported/${userId}`,
    });

    // Create the contract row. contractType + payRate take admin-
    // supplied values when present (validated above), otherwise
    // defaults of ct_permanent + 0. startDate is "today" as a
    // placeholder — the PDF has the real value.
    const now = new Date();
    const contract = await prisma.employmentContract.create({
      data: {
        userId,
        contractType,
        payRate,
        startDate: now,
        status: "active",
        documentUrl: uploaded.url,
        documentId: null,
        acknowledgedByStaff: true,
        acknowledgedAt: now,
        signedAt: now,
        notes:
          "Imported from existing PDF — see attached document for the " +
          "full terms (dates, hours, award level). Created via the " +
          "drag-and-drop quick-upload on the staff profile.",
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "quick_upload_contract",
        entityType: "EmploymentContract",
        entityId: contract.id,
        details: {
          targetUserId: userId,
          fileName: fileObj.name,
          fileSize: fileObj.size,
          contractType,
          payRate,
        },
      },
    });

    logger.info("Contract quick-uploaded", {
      id: contract.id,
      targetUserId: userId,
      uploadedById: session!.user.id,
      blobUrl: uploaded.url,
    });

    return NextResponse.json(contract, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin"] },
);
