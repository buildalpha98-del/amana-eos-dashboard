import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { resolveOnboardingPackForContract } from "@/lib/contracts/onboarding-mapping";
import { parseJsonBody } from "@/lib/api-error";
import { renderTemplateHtml, type TipTapDoc } from "@/lib/contract-templates/render-html";
import { renderContractPdf } from "@/lib/pdf/render-contract";
import { uploadFile } from "@/lib/storage";

// 2026-06-02: signature pad PNG data URL captured client-side. Optional
// to preserve compatibility with the bare-acknowledgement flow (legacy
// contracts pre-signature-feature) — when omitted, the route behaves
// exactly like the old contract-only path.
const acknowledgeBodySchema = z
  .object({
    staffSignatureDataUrl: z
      .string()
      .startsWith("data:image/", "Must be a PNG data URL")
      .max(500_000, "Signature image too large")
      .optional(),
  })
  .optional();

// POST /api/contracts/[id]/acknowledge — staff signs their own contract
//
// Endpoint name + DB field (`acknowledgedByStaff`) intentionally kept
// as-is for 2026-06-02 user-facing relabel "Acknowledged" → "Signed".
// Renaming the API path / column would cascade through every consumer
// — the UI does the cosmetic relabel only.
//
// 2026-06-02: optional staffSignatureDataUrl in body. When supplied,
// the route stores the staff signature, fetches the original template,
// and re-renders the PDF with BOTH admin + staff signatures embedded.
// New PDF gets uploaded and replaces documentUrl on the row. Failure
// to re-render is non-fatal — the signature is still saved and the
// staff member is still marked as signed; the contract just keeps the
// original (admin-only) PDF until an admin can re-issue.
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const rawBody = await parseJsonBody(req).catch(() => undefined);
  const parsedBody = acknowledgeBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0].message },
      { status: 400 },
    );
  }
  const staffSignatureDataUrl = parsedBody.data?.staffSignatureDataUrl;

  const contract = await prisma.employmentContract.findUnique({
    where: { id },
    include: {
      template: true,
    },
  });

  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  // Staff can only sign their own contract
  if (contract.userId !== session!.user.id) {
    return NextResponse.json(
      { error: "You can only sign your own contract" },
      { status: 403 }
    );
  }

  if (contract.acknowledgedByStaff) {
    return NextResponse.json(
      { error: "Contract already signed" },
      { status: 409 }
    );
  }

  // ── Re-render the PDF with both signatures embedded ──
  // Only attempted when:
  //   (1) the staff sent a signature this turn, AND
  //   (2) the contract was originally issued from a template — bare-form
  //       contracts have no template doc to re-render from.
  let regeneratedDocumentUrl: string | null = null;
  if (staffSignatureDataUrl && contract.templateId && contract.template) {
    try {
      // templateValues was stored at issue time as { auto, manual }.
      const values = contract.templateValues as
        | { auto?: Record<string, string>; manual?: Record<string, string> }
        | null;
      const auto = values?.auto ?? {};
      const manual = values?.manual ?? {};

      // Friendly date strings consumed by the signature footer / inline
      // signature captions. Admin date comes from the stored timestamp;
      // staff date is "now" since this request IS the staff signature.
      const friendlyDate = (d: Date | null | undefined) =>
        d
          ? new Date(d).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : "";
      const nowFriendly = new Date().toLocaleDateString("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      const allData: Record<string, string> = {
        ...auto,
        ...manual,
        "signature.admin": contract.adminSignatureDataUrl ?? "",
        "signature.staff": staffSignatureDataUrl,
        "signature.adminDate": friendlyDate(contract.adminSignedAt),
        "signature.staffDate": nowFriendly,
      };

      const { html } = renderTemplateHtml({
        doc: contract.template.contentJson as TipTapDoc,
        data: allData,
      });
      const pdf = await renderContractPdf(html);
      const { url } = await uploadFile(
        pdf,
        `contract-${contract.userId}-${Date.now()}-signed.pdf`,
        { contentType: "application/pdf", folder: "contracts/issued" },
      );
      regeneratedDocumentUrl = url;
    } catch (err) {
      // Non-fatal — log and continue. Staff still gets credited for
      // signing; the document just doesn't carry their signature
      // visually until an admin re-issues.
      logger.error("acknowledge: PDF re-render with signatures failed", {
        contractId: id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const updated = await prisma.employmentContract.update({
    where: { id },
    data: {
      acknowledgedByStaff: true,
      acknowledgedAt: new Date(),
      staffSignatureDataUrl: staffSignatureDataUrl ?? null,
      // Only overwrite documentUrl when we successfully re-rendered.
      // Failing to re-render must NOT wipe the original document.
      ...(regeneratedDocumentUrl ? { documentUrl: regeneratedDocumentUrl } : {}),
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, avatar: true },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "acknowledge",
      entityType: "EmploymentContract",
      entityId: id,
      details: { contractType: contract.contractType },
    },
  });

  // Contract acknowledged — seed onboarding pack if none exists for this (user, pack) pair.
  try {
    const user = await prisma.user.findUnique({
      where: { id: session!.user.id },
      select: { serviceId: true },
    });
    const pack = await resolveOnboardingPackForContract({
      contractType: contract.contractType,
      userServiceId: user?.serviceId ?? null,
    });
    if (!pack) {
      logger.warn("No OnboardingPack resolvable for contract ack", {
        userId: session!.user.id,
        contractId: id,
        contractType: contract.contractType,
      });
    } else {
      const existing = await prisma.staffOnboarding.findUnique({
        where: { userId_packId: { userId: session!.user.id, packId: pack.id } },
      });
      if (!existing) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 14);
        await prisma.staffOnboarding.create({
          data: {
            userId: session!.user.id,
            packId: pack.id,
            status: "not_started",
            dueDate,
          },
        });
      }
    }
  } catch (err) {
    // Don't fail the ack if seeding errors — log and move on.
    logger.error("Failed to seed onboarding after contract ack (non-fatal)", {
      userId: session!.user.id,
      contractId: id,
      err,
    });
  }

  return NextResponse.json(updated);
});
