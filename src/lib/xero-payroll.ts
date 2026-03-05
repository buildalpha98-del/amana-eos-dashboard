import { getValidAccessToken, xeroApiRequest } from "@/lib/xero";
import { prisma } from "@/lib/prisma";

// ─── Xero Payroll API ───────────────────────────────────────────────────────
// AU Payroll API base: https://api.xero.com/payroll.xro/1.0
// Required scopes (added to SCOPES in xero.ts):
//   payroll.employees.read, payroll.timesheets, payroll.payruns,
//   payroll.payslip.read, payroll.settings.read

const XERO_PAYROLL_BASE = "https://api.xero.com/payroll.xro/1.0";

// ─── Low-Level Payroll Request ──────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make an authenticated request to the Xero AU Payroll API.
 * Mirrors `xeroApiRequest` from xero.ts but uses the payroll base URL.
 */
export async function xeroPayrollRequest(
  path: string,
  options?: RequestInit & { retries?: number }
): Promise<any> {
  const token = await getValidAccessToken();
  const conn = await prisma.xeroConnection.findUnique({
    where: { id: "singleton" },
    select: { tenantId: true },
  });

  if (!conn?.tenantId) {
    throw new Error("Xero tenant not configured");
  }

  const maxRetries = options?.retries ?? 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(`${XERO_PAYROLL_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Xero-Tenant-Id": conn.tenantId,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "5", 10);
      await sleep(retryAfter * 1000);
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Xero Payroll API error (${res.status}): ${errText.slice(0, 500)}`
      );
    }

    return res.json();
  }

  throw new Error("Xero Payroll API: max retries exceeded due to rate limiting");
}

// ─── Employee Helpers ───────────────────────────────────────────────────────

export interface XeroEmployee {
  EmployeeID: string;
  FirstName: string;
  LastName: string;
  Email?: string;
  Status: string;
}

/** Fetch all employees from Xero Payroll */
export async function fetchPayrollEmployees(): Promise<XeroEmployee[]> {
  const data = await xeroPayrollRequest("/Employees");
  return data.Employees ?? [];
}

/** Fetch a single employee by Xero Employee ID */
export async function fetchPayrollEmployee(
  employeeId: string
): Promise<XeroEmployee | null> {
  const data = await xeroPayrollRequest(`/Employees/${employeeId}`);
  return data.Employees?.[0] ?? null;
}

// ─── Leave Balance Helpers ──────────────────────────────────────────────────

export interface XeroLeaveBalance {
  LeaveName: string;
  LeaveTypeID: string;
  NumberOfUnits: number;
  TypeOfUnits: string;
}

/**
 * Fetch leave balances for a Xero employee.
 * Used by the Leave Balance Sync feature.
 */
export async function fetchLeaveBalances(
  employeeId: string
): Promise<XeroLeaveBalance[]> {
  const data = await xeroPayrollRequest(
    `/Employees/${employeeId}?includeLeaveBalances=true`
  );
  const employee = data.Employees?.[0];
  return employee?.LeaveBalances ?? [];
}

// ─── Timesheet Helpers ──────────────────────────────────────────────────────

export interface XeroTimesheetLine {
  EarningsRateID: string;
  NumberOfUnits: number[];
}

export interface XeroTimesheetPayload {
  EmployeeID: string;
  StartDate: string; // "/Date(timestamp)/" format
  EndDate: string;
  Status: "Draft" | "Approved" | "Processed";
  TimesheetLines: XeroTimesheetLine[];
}

/**
 * Convert a JS Date to Xero's date format: "/Date(epochMs+0000)/"
 */
function toXeroDate(date: Date): string {
  return `/Date(${date.getTime()}+0000)/`;
}

/**
 * Push a timesheet to Xero Payroll.
 * The timesheet should be structured per Xero's AU Payroll API spec.
 */
export async function createXeroTimesheet(
  payload: XeroTimesheetPayload
): Promise<any> {
  return xeroPayrollRequest("/Timesheets", {
    method: "POST",
    body: JSON.stringify([payload]),
  });
}

/**
 * Push multiple timesheets to Xero in a single batch.
 */
export async function createXeroTimesheetsBatch(
  payloads: XeroTimesheetPayload[]
): Promise<any> {
  return xeroPayrollRequest("/Timesheets", {
    method: "POST",
    body: JSON.stringify(payloads),
  });
}

// ─── Pay Run Helpers ────────────────────────────────────────────────────────

export interface XeroPayRun {
  PayRunID: string;
  PayrollCalendarID: string;
  PayRunPeriodStartDate: string;
  PayRunPeriodEndDate: string;
  PayRunStatus: string;
}

/** Fetch pay runs (optionally filtered by status) */
export async function fetchPayRuns(): Promise<XeroPayRun[]> {
  const data = await xeroPayrollRequest("/PayRuns");
  return data.PayRuns ?? [];
}

// ─── Payslip Helpers ────────────────────────────────────────────────────────

export interface XeroPayslip {
  PayslipID: string;
  EmployeeID: string;
  FirstName: string;
  LastName: string;
  TotalEarnings: number;
  TotalDeductions: number;
  NetPay: number;
}

/**
 * Fetch payslips for a specific pay run.
 * Used by the My Portal payslips section.
 */
export async function fetchPayslipsForPayRun(
  payRunId: string
): Promise<XeroPayslip[]> {
  const data = await xeroPayrollRequest(`/PayRuns/${payRunId}`);
  const payRun = data.PayRuns?.[0];
  return payRun?.Payslips ?? [];
}

/**
 * Fetch a specific payslip by ID.
 */
export async function fetchPayslip(payslipId: string): Promise<any> {
  const data = await xeroPayrollRequest(`/Payslips/${payslipId}`);
  return data.Payslip ?? null;
}

// ─── Earnings Rate Helpers ──────────────────────────────────────────────────

export interface XeroEarningsRate {
  EarningsRateID: string;
  Name: string;
  EarningsType: string;
  RateType: string;
  RatePerUnit?: number;
}

/**
 * Fetch all earnings rates (ordinary hours, overtime, etc.).
 * Needed to map shift types to the correct Xero earnings rate when exporting timesheets.
 */
export async function fetchEarningsRates(): Promise<XeroEarningsRate[]> {
  const data = await xeroPayrollRequest("/PayItems");
  return data.PayItems?.EarningsRates ?? [];
}

// ─── Leave Type Helpers ─────────────────────────────────────────────────────

export interface XeroLeaveType {
  LeaveTypeID: string;
  Name: string;
  TypeOfUnits: string;
  IsPaidLeave: boolean;
}

/** Fetch all leave types configured in Xero */
export async function fetchLeaveTypes(): Promise<XeroLeaveType[]> {
  const data = await xeroPayrollRequest("/PayItems");
  return data.PayItems?.LeaveTypes ?? [];
}

// ─── Timesheet Export Helper (High-Level) ───────────────────────────────────

/**
 * Converts an AmanaEOS timesheet (with entries) into Xero format and pushes it.
 *
 * @param timesheet - The AmanaEOS timesheet record (with entries and user xeroEmployeeIds)
 * @param earningsRateId - The Xero Earnings Rate ID for ordinary hours
 * @returns The Xero API response
 */
export async function exportTimesheetToXero(opts: {
  xeroEmployeeId: string;
  weekStartDate: Date;
  weekEndDate: Date;
  /** Array of 7 numbers representing hours worked Mon-Sun */
  dailyHours: number[];
  earningsRateId: string;
}): Promise<any> {
  const payload: XeroTimesheetPayload = {
    EmployeeID: opts.xeroEmployeeId,
    StartDate: toXeroDate(opts.weekStartDate),
    EndDate: toXeroDate(opts.weekEndDate),
    Status: "Approved",
    TimesheetLines: [
      {
        EarningsRateID: opts.earningsRateId,
        NumberOfUnits: opts.dailyHours,
      },
    ],
  };

  return createXeroTimesheet(payload);
}
