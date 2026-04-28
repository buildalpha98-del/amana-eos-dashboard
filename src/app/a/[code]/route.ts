import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  buildDestinationWithUtm,
  clientIpFromRequest,
  hashIp,
  publicBaseUrl,
} from "@/lib/activation-qr";

const FALLBACK_PATH = "/parent/enquire";

/**
 * Public QR scan route. Records the scan, then redirects to either the
 * activation's configured destinationUrl or a generic fallback enquiry page.
 *
 * No auth — anyone with the QR can hit this. We do basic per-request scan
 * logging (IP hash, user-agent, referrer) for analytics.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  if (!code) {
    return NextResponse.redirect(new URL(FALLBACK_PATH, publicBaseUrl()));
  }

  const activation = await prisma.campaignActivationAssignment.findUnique({
    where: { qrShortCode: code },
    select: {
      id: true,
      qrShortCode: true,
      qrDestinationUrl: true,
      service: { select: { id: true, name: true, code: true } },
    },
  });

  if (!activation) {
    // Unknown code — redirect to a generic landing page rather than 404.
    return NextResponse.redirect(`${publicBaseUrl()}${FALLBACK_PATH}`);
  }

  // Best-effort scan log; never fail the redirect on logging issues.
  const ipHash = hashIp(clientIpFromRequest(req));
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  const referrer = req.headers.get("referer")?.slice(0, 500) ?? null;
  prisma.activationScan
    .create({
      data: {
        activationId: activation.id,
        ipHash,
        userAgent,
        referrer,
      },
    })
    .catch((err) => {
      logger.error("activation-scan log failed", { activationId: activation.id, err });
    });

  // Build the redirect destination.
  const fallback = `${publicBaseUrl()}${FALLBACK_PATH}?serviceId=${activation.service.id}`;
  const destination = activation.qrDestinationUrl?.trim() || fallback;
  const final = buildDestinationWithUtm(destination, code);

  return NextResponse.redirect(final);
}
