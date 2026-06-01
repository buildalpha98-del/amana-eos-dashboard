import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { buildStaffRegister } from "@/lib/nqf-registers";
import { RegistersClient } from "./RegistersClient";

/**
 * /compliance/registers — NQF Reg 145 / Reg 148 staff register, plus
 * placeholder tabs for Reg 146 (Nominated Supervisor) and Reg 147
 * (Volunteers & students).
 *
 * Server component fetches the data + the service list for the filter
 * dropdown, then hands off to the client component for table render +
 * download buttons + tab switching.
 *
 * Admin-only — confirmed both at the page server-component AND at the
 * underlying API routes.
 */

interface RegistersPageProps {
  searchParams: Promise<{ serviceId?: string }>;
}

export default async function RegistersPage({
  searchParams,
}: RegistersPageProps) {
  const session = await requirePageSession();
  const role = session.user.role;
  if (role !== "owner" && role !== "admin" && role !== "head_office") {
    redirect("/compliance");
  }

  const { serviceId } = await searchParams;
  const [rows, services] = await Promise.all([
    buildStaffRegister(serviceId),
    prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <RegistersClient
      initialRows={rows}
      services={services}
      selectedServiceId={serviceId ?? null}
    />
  );
}
