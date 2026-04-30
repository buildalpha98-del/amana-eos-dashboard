import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  buildDestinationWithUtm,
  clientIpFromRequest,
  geolocationFromRequest,
  hashIp,
  publicBaseUrl,
} from "@/lib/activation-qr";

const FALLBACK_PATH = "/enquire";

/**
 * Public QR scan route. Records the scan in QrScan, then redirects to the
 * QR's destinationUrl with utm_source/medium/campaign appended.
 *
 * No auth — anyone with the QR can hit this. Per-scan we log:
 *   - Anonymous IP hash (no raw IPs)
 *   - User-agent
 *   - Referrer
 *   - Country / region / city (Vercel headers, best effort)
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  if (!code) return NextResponse.redirect(`${publicBaseUrl()}${FALLBACK_PATH}`);

  const qr = await prisma.qrCode.findUnique({
    where: { shortCode: code },
    select: {
      id: true,
      shortCode: true,
      destinationUrl: true,
      active: true,
      service: { select: { id: true, name: true } },
    },
  });

  if (!qr) {
    return NextResponse.redirect(`${publicBaseUrl()}${FALLBACK_PATH}`);
  }

  // Best-effort scan logging — never block the redirect on logging issues.
  const ipHash = hashIp(clientIpFromRequest(req));
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  const referrer = req.headers.get("referer")?.slice(0, 500) ?? null;
  const geo = geolocationFromRequest(req);
  prisma.qrScan
    .create({
      data: {
        qrCodeId: qr.id,
        ipHash,
        userAgent,
        referrer,
        country: geo.country,
        region: geo.region,
        city: geo.city,
      },
    })
    .catch((err) => logger.error("qr-scan log failed", { qrCodeId: qr.id, err }));

  // If the QR has been archived, still resolve the scan but route to a fallback
  // so old printed flyers don't 404.
  const fallback = `${publicBaseUrl()}${FALLBACK_PATH}${qr.service ? `?serviceId=${qr.service.id}` : ""}`;
  const destination = qr.active && qr.destinationUrl ? qr.destinationUrl : fallback;
  return NextResponse.redirect(buildDestinationWithUtm(destination, code));
}
