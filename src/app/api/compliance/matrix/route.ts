import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const REQUIRED_CERT_TYPES = [
  "wwcc",
  "first_aid",
  "anaphylaxis",
  "asthma",
  "cpr",
  "police_check",
  "annual_review",
] as const;

type CertStatus = "valid" | "expiring" | "expired" | "missing";

function getCertStatus(
  expiryDate: Date | null
): { status: CertStatus; daysLeft: number | null } {
  if (!expiryDate) {
    return { status: "missing", daysLeft: null };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil(
    (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysLeft < 0) {
    return { status: "expired", daysLeft };
  }
  if (daysLeft <= 30) {
    return { status: "expiring", daysLeft };
  }
  return { status: "valid", daysLeft };
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  // Get all active users who have a serviceId (staff assigned to centres)
  const userWhere: Record<string, unknown> = {
    active: true,
    serviceId: { not: null },
  };
  if (serviceId) {
    userWhere.serviceId = serviceId;
  }

  const users = await prisma.user.findMany({
    where: userWhere,
    select: {
      id: true,
      name: true,
      serviceId: true,
      service: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ service: { name: "asc" } }, { name: "asc" }],
  });

  if (users.length === 0) {
    return NextResponse.json({
      rows: [],
      summary: {
        totalStaff: 0,
        fullyCompliant: 0,
        atRisk: 0,
        nonCompliant: 0,
      },
    });
  }

  const userIds = users.map((u) => u.id);

  // Get all compliance certificates for these users
  const certificates = await prisma.complianceCertificate.findMany({
    where: {
      userId: { in: userIds },
    },
    select: {
      id: true,
      userId: true,
      type: true,
      expiryDate: true,
      fileUrl: true,
      fileName: true,
    },
    orderBy: { expiryDate: "desc" },
  });

  // Group certs by userId + type, keeping only the latest per type
  const certMap = new Map<string, typeof certificates[number]>();
  for (const cert of certificates) {
    if (!cert.userId) continue;
    const key = `${cert.userId}:${cert.type}`;
    // Already sorted desc, so first encountered is the latest
    if (!certMap.has(key)) {
      certMap.set(key, cert);
    }
  }

  // Build rows
  let fullyCompliant = 0;
  let atRisk = 0;
  let nonCompliant = 0;

  const rows = users.map((user) => {
    let validCount = 0;
    let hasExpiring = false;
    let hasExpiredOrMissing = false;

    const certs = REQUIRED_CERT_TYPES.map((type) => {
      const key = `${user.id}:${type}`;
      const cert = certMap.get(key);

      if (!cert) {
        hasExpiredOrMissing = true;
        return {
          type,
          status: "missing" as CertStatus,
          expiryDate: null,
          daysLeft: null,
        };
      }

      const { status, daysLeft } = getCertStatus(cert.expiryDate);

      if (status === "valid") {
        validCount++;
      } else if (status === "expiring") {
        validCount++; // Still valid, just expiring soon
        hasExpiring = true;
      } else if (status === "expired") {
        hasExpiredOrMissing = true;
      } else {
        hasExpiredOrMissing = true;
      }

      return {
        type,
        status,
        expiryDate: cert.expiryDate.toISOString().split("T")[0],
        daysLeft,
      };
    });

    // Determine staff compliance category
    if (validCount === REQUIRED_CERT_TYPES.length && !hasExpiredOrMissing) {
      if (hasExpiring) {
        atRisk++;
      } else {
        fullyCompliant++;
      }
    } else if (hasExpiredOrMissing) {
      nonCompliant++;
    } else if (hasExpiring) {
      atRisk++;
    }

    return {
      userId: user.id,
      userName: user.name,
      serviceName: user.service?.name ?? "Unassigned",
      serviceCode: user.service?.code ?? "",
      certs,
      validCount,
      totalRequired: REQUIRED_CERT_TYPES.length,
    };
  });

  return NextResponse.json({
    rows,
    summary: {
      totalStaff: users.length,
      fullyCompliant,
      atRisk,
      nonCompliant,
    },
  });
}
