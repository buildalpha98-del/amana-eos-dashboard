import { NextResponse } from "next/server";
import { z } from "zod";
import QRCode from "qrcode";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { buildScanUrl, generateUniqueShortCode } from "@/lib/activation-qr";

async function ensureShortCode(activationId: string): Promise<string> {
  const existing = await prisma.campaignActivationAssignment.findUnique({
    where: { id: activationId },
    select: { qrShortCode: true },
  });
  if (!existing) throw ApiError.notFound("Activation not found");
  if (existing.qrShortCode) return existing.qrShortCode;
  const code = await generateUniqueShortCode();
  await prisma.campaignActivationAssignment.update({
    where: { id: activationId },
    data: { qrShortCode: code },
  });
  return code;
}

/** GET — return current QR (creates one lazily if missing). */
export const GET = withApiAuth(
  async (_req, _session, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("activation id required");

    const code = await ensureShortCode(id);
    const url = buildScanUrl(code);
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 256, errorCorrectionLevel: "M" });

    return NextResponse.json({
      shortCode: code,
      scanUrl: url,
      svg,
    });
  },
  { roles: ["marketing", "owner"] },
);

const patchSchema = z.object({
  /** Where the scan should redirect to. Empty string clears the destination. */
  destinationUrl: z.string().max(2000).nullable().optional(),
  /** Force-regenerate the short code. Old code becomes invalid. */
  regenerate: z.boolean().optional(),
});

export const PATCH = withApiAuth(
  async (req, _session, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("activation id required");

    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const existing = await prisma.campaignActivationAssignment.findUnique({
      where: { id },
      select: { id: true, qrShortCode: true },
    });
    if (!existing) throw ApiError.notFound("Activation not found");

    const data: Record<string, unknown> = {};
    if (parsed.data.destinationUrl !== undefined) {
      const trimmed = parsed.data.destinationUrl?.trim();
      if (trimmed && trimmed.length > 0) {
        // Validate the URL is parseable
        try {
          new URL(trimmed);
        } catch {
          throw ApiError.badRequest("destinationUrl must be a valid absolute URL");
        }
        data.qrDestinationUrl = trimmed;
      } else {
        data.qrDestinationUrl = null;
      }
    }
    if (parsed.data.regenerate) {
      data.qrShortCode = await generateUniqueShortCode();
    }

    const updated = await prisma.campaignActivationAssignment.update({
      where: { id },
      data,
      select: { id: true, qrShortCode: true, qrDestinationUrl: true },
    });

    return NextResponse.json({
      id: updated.id,
      shortCode: updated.qrShortCode,
      scanUrl: updated.qrShortCode ? buildScanUrl(updated.qrShortCode) : null,
      destinationUrl: updated.qrDestinationUrl,
    });
  },
  { roles: ["marketing", "owner"] },
);
