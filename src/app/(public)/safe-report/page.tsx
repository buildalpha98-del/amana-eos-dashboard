import { prisma } from "@/lib/prisma";
import { SafeReportForm } from "./SafeReportForm";

/**
 * /safe-report — public anonymous reporting form.
 *
 * Deliberately not gated by auth. A staff member submitting a
 * harassment complaint may be doing it from their personal phone
 * specifically because they don't trust their work account isn't
 * being watched. The whole point of the channel is that no
 * authentication state is required (or recorded).
 *
 * The page is a server component for service-list lookup only —
 * the form itself is client-side and posts to /api/safe-reports.
 */
export default async function SafeReportPage() {
  const services = await prisma.service.findMany({
    where: { status: "active" },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  return <SafeReportForm services={services} />;
}
