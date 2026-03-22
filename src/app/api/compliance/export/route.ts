import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
const REQUIRED_CERT_TYPES = [
  "wwcc",
  "first_aid",
  "anaphylaxis",
  "asthma",
  "cpr",
  "police_check",
  "annual_review",
] as const;

const TYPE_LABELS: Record<string, string> = {
  wwcc: "WWCC",
  first_aid: "First Aid",
  anaphylaxis: "Anaphylaxis",
  asthma: "Asthma",
  cpr: "CPR",
  police_check: "Police Check",
  annual_review: "Annual Review",
};

type CertStatus = "Valid" | "Expiring" | "Expired" | "Missing";

function getCertStatus(expiryDate: Date | null): CertStatus {
  if (!expiryDate) return "Missing";

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil(
    (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysLeft < 0) return "Expired";
  if (daysLeft <= 30) return "Expiring";
  return "Valid";
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const GET = withApiAuth(async (req, session) => {
const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  // Get all active users with a serviceId
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
      service: { select: { name: true, code: true } },
    },
    orderBy: [{ service: { name: "asc" } }, { name: "asc" }],
  });

  const userIds = users.map((u) => u.id);

  // Get all compliance certificates for these users
  const certificates = await prisma.complianceCertificate.findMany({
    where: {
      userId: { in: userIds },
    },
    select: {
      userId: true,
      type: true,
      expiryDate: true,
    },
    orderBy: { expiryDate: "desc" },
  });

  // Group certs by userId + type, keeping only the latest per type
  const certMap = new Map<
    string,
    { expiryDate: Date; type: string }
  >();
  for (const cert of certificates) {
    if (!cert.userId) continue;
    const key = `${cert.userId}:${cert.type}`;
    if (!certMap.has(key)) {
      certMap.set(key, { expiryDate: cert.expiryDate, type: cert.type });
    }
  }

  // Build CSV header
  const headerParts = ["Staff Name", "Centre"];
  for (const type of REQUIRED_CERT_TYPES) {
    headerParts.push(TYPE_LABELS[type]);
    headerParts.push(`${TYPE_LABELS[type]} Expiry`);
  }
  const headerLine = headerParts.join(",");

  // Build CSV rows
  const dataLines = users.map((user) => {
    const parts: string[] = [
      escapeCSV(user.name),
      escapeCSV(
        user.service
          ? `${user.service.name} (${user.service.code})`
          : "Unassigned"
      ),
    ];

    for (const type of REQUIRED_CERT_TYPES) {
      const key = `${user.id}:${type}`;
      const cert = certMap.get(key);

      if (!cert) {
        parts.push("Missing");
        parts.push("");
      } else {
        const status = getCertStatus(cert.expiryDate);
        parts.push(status);
        parts.push(cert.expiryDate.toISOString().split("T")[0]);
      }
    }

    return parts.join(",");
  });

  const csvString = [headerLine, ...dataLines].join("\n");
  const today = new Date().toISOString().split("T")[0];

  return new NextResponse(csvString, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="compliance-matrix-${today}.csv"`,
    },
  });
}, { roles: ["owner", "head_office", "admin"] });
