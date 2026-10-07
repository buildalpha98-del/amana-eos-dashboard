/**
 * GET /api/my-portal/payroll — the signed-in staff member's payroll
 * details, live from Employment Hero: setup status, bank accounts (masked)
 * and super funds. Nothing here is stored in our database (2026-10-07).
 *
 * Never 404s on "not linked" — the Bank & super section renders that state
 * itself, so it returns `{ linked: false }` instead.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import {
  EhPayrollError,
  getEmployee,
  isConfigured,
  listBankAccounts,
  listSuperFunds,
} from "@/lib/eh-payroll";
import { maskBankAccount, summariseSuperFund } from "@/lib/payroll-details";
import { logger } from "@/lib/logger";

export const GET = withApiAuth(async (_req, session) => {
  if (!isConfigured()) {
    return NextResponse.json({ configured: false, linked: false });
  }
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { employmentHeroEmployeeId: true },
  });
  const employeeId = user?.employmentHeroEmployeeId ?? null;
  if (employeeId === null) {
    return NextResponse.json({ configured: true, linked: false });
  }

  try {
    const [employee, bank, funds] = await Promise.all([
      getEmployee(employeeId),
      listBankAccounts(employeeId),
      listSuperFunds(employeeId),
    ]);
    return NextResponse.json({
      configured: true,
      linked: true,
      // "Incomplete" = they haven't finished EH Self Setup (tax file
      // declaration etc.) yet.
      setupComplete: employee.status === "Active",
      bankAccounts: bank.map(maskBankAccount),
      superFunds: funds.map(summariseSuperFund),
    });
  } catch (err) {
    if (err instanceof EhPayrollError) {
      logger.warn("My payroll details: EH failure", { employeeId, status: err.status });
      return NextResponse.json(
        { error: "Couldn't reach Employment Hero — try again in a minute." },
        { status: 502 },
      );
    }
    throw err;
  }
});
