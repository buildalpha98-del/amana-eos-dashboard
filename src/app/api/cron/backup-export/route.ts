import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { uploadFile } from "@/lib/storage";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

/**
 * POST /api/cron/backup-export
 *
 * Monthly cron that exports critical tables to Vercel Blob as CSV.
 * Tables (in recovery priority order):
 *   1. Users — staff records, roles, contact details
 *   2. Services — centre configuration
 *   3. ParentEnquiry — enrolment pipeline
 *   4. Rock — strategic priorities
 *   5. ComplianceCert — regulatory compliance records
 */
export const POST = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const lock = await acquireCronLock("backup-export", "monthly");
  if (!lock.acquired) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  try {
    const timestamp = new Date().toISOString().slice(0, 10);
    const results: { table: string; rows: number; url: string }[] = [];

    // 1. Users
    const users = await prisma.user.findMany({
      select: {
        id: true, name: true, email: true, role: true, phone: true,
        active: true, serviceId: true, createdAt: true,
      },
    });
    results.push(await exportToCsv("users", users, timestamp));

    // 2. Services
    const services = await prisma.service.findMany({
      select: {
        id: true, name: true, code: true, address: true,
        state: true, capacity: true,
      },
    });
    results.push(await exportToCsv("services", services, timestamp));

    // 3. Parent Enquiries
    const enquiries = await prisma.parentEnquiry.findMany({
      select: {
        id: true, parentName: true, parentEmail: true, parentPhone: true,
        stage: true, serviceId: true, createdAt: true,
      },
    });
    results.push(await exportToCsv("enquiries", enquiries, timestamp));

    // 4. Rocks
    const rocks = await prisma.rock.findMany({
      select: {
        id: true, title: true, ownerId: true, quarter: true,
        status: true, createdAt: true,
      },
    });
    results.push(await exportToCsv("rocks", rocks, timestamp));

    // 5. Compliance Certs
    const certs = await prisma.complianceCertificate.findMany({
      select: {
        id: true, userId: true, type: true, label: true,
        expiryDate: true, acknowledged: true, createdAt: true,
      },
    });
    results.push(await exportToCsv("compliance-certs", certs, timestamp));

    await lock.complete();

    return NextResponse.json({
      success: true,
      timestamp,
      exports: results,
    });
  } catch (err) {
    logger.error("Cron: backup-export", { err });
    await lock.fail(err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json(
      { error: "Backup export failed" },
      { status: 500 },
    );
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((h) => escapeCsvField(row[h])).join(","),
    ),
  ];
  return lines.join("\n");
}

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function exportToCsv(
  tableName: string,
  rows: Record<string, unknown>[],
  timestamp: string,
): Promise<{ table: string; rows: number; url: string }> {
  const csv = toCsv(rows);
  const buffer = Buffer.from(csv, "utf-8");
  const filename = `backup-${tableName}-${timestamp}.csv`;

  const { url } = await uploadFile(buffer, filename, {
    contentType: "text/csv",
    folder: "backups",
    // Backups contain sensitive user/enquiry/compliance data — keep private.
    access: "private",
  });

  return { table: tableName, rows: rows.length, url };
}
