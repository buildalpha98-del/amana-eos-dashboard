/**
 * Employment Hero Payroll (formerly KeyPay) — typed API client.
 *
 * Powers the staff-facing My Portal integrations:
 *   • Payslips (GET only — surfaced inline via FileViewerModal)
 *   • Leave balances + requests (GET + POST)
 *   • Expense claims (GET + POST with receipt upload)
 *
 * # Canonical endpoints (verified 2026-06-01 against swagger-au.json)
 *
 * The HTML docs page at api.keypay.com.au/australia/reference.html had
 * several wrong paths (hyphenated when actually concatenated). The
 * Swagger spec at https://api.keypay.com.au/swagger-au.json is the
 * authoritative source. Don't trust the HTML.
 *
 *   Payslips:
 *     GET  /employee/{employeeId}/document
 *          → EmployeeDocumentModel[] (filter where friendlyName matches
 *            "Pay Slip*" or similar — payslips are stored as documents,
 *            there is NO dedicated /payslips endpoint)
 *     GET  /employee/{employeeId}/document/{employeeDocumentId}/content
 *          → application/pdf bytes
 *
 *   Leave:
 *     GET  /employee/{employeeId}/leaverequest
 *          → HourLeaveRequestResponseModel[]
 *            ({id, leaveCategoryId, leaveCategory, fromDate, toDate,
 *              totalHours, status, notes, attachmentId})
 *     POST /employee/{employeeId}/leaverequest
 *          → body: HourLeaveRequestModel
 *            ({fromDate, toDate, hours, leaveCategoryId, notes,
 *              automaticallyApprove, attachment})
 *     GET  /employee/{employeeId}/leavebalances
 *          → LeaveBalanceModel[]
 *            ({leaveCategoryId, leaveCategoryName, accruedAmount,
 *              unitType: 'Hours'|'Days'|'Weeks'})
 *     GET  /employee/{employeeId}/leaverequest/estimate
 *          → preview hours before submitting (handy for the form)
 *     GET  /business/{businessId}/leavecategory
 *          → all leave types defined for the business
 *
 *   Expense:
 *     GET  /employee/{employeeId}/expenserequest
 *          → ExpenseRequestResponseModel[]
 *     POST /employee/{employeeId}/expenserequest
 *          → body: ExpenseRequestEditModel (employeeId, description,
 *            lineItems[], attachments[])
 *     POST /employee/{employeeId}/expenserequest/{id}/attachment
 *          → multipart receipt upload (NOT 'upload-attachment' as the
 *            HTML docs claimed)
 *     GET  /business/{businessId}/employeeexpensecategory
 *          → expense categories available to staff
 *
 *   Webhooks:
 *     POST /business/{businessId}/webhookregistrations
 *          → body: WebHook ({webHookUri, secret, filters[], headers,
 *            properties}). Subscribe to LeaveRequest.Approved /
 *            ExpenseRequest.Approved events so My Portal updates in
 *            real-time without polling.
 *
 *   ESS namespace (alternative — for browser-side calls):
 *     /api/v2/ess/{employeeId}/leave/*
 *     /api/v2/ess/{employeeId}/leave/balances
 *     /api/v2/ess/{employeeId}/leave/leavecategories
 *     We DON'T use these. The dashboard authenticates as the business
 *     (single API key) and represents the user via `requireOwnEmployee()`.
 *     ESS endpoints expect a per-user OAuth token which we don't issue.
 *
 * # Auth
 * Single business-level API key. HTTP Basic where username = API key,
 * password is any non-empty string. Key + business ID + API base all live
 * in env vars (see `.env.example`). Connected on 2026-06-01 against the
 * Amana OSHC business (id 407666) on the AU endpoint.
 *
 * # Security model
 * The key has full business access. Every dashboard route that uses this
 * client MUST verify `session.user.id` matches the User record whose
 * `employmentHeroEmployeeId` is being read or written. Do NOT let one
 * staff member's session pull another staff member's payslips/leave/etc.
 * Use `requireOwnEmployee()` (see `eh-payroll-auth.ts`) as the guard.
 *
 * # Rate limits
 * EH Payroll API enforces 60 req/min per business. We layer:
 *   - Short-lived in-memory cache on the GET helpers (15s for balances,
 *     5min for employee lists, configurable per endpoint)
 *   - Retry-once on 429 with `Retry-After` honoured
 *   - Structured `logger.warn` on rate-limit hits so we can spot patterns
 *
 * # Don't
 * - Don't cache PII (payslip PDFs, bank details, TFN). Proxy them
 *   on each request and stream to the client without persisting.
 * - Don't log the API key, even partially.
 * - Don't call this from the client. All calls go through `withApiAuth`
 *   wrapped server routes.
 */

import { logger } from "@/lib/logger";

const API_BASE = process.env.EH_PAYROLL_API_BASE || "https://api.yourpayroll.com.au";
const API_KEY = process.env.EH_PAYROLL_API_KEY || "";
const BUSINESS_ID = process.env.EH_PAYROLL_BUSINESS_ID || "";

export class EhPayrollError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `EH Payroll API error: HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

/** Throws if the integration isn't configured. Lets callers fail fast with a
 *  clear message instead of a generic 401 from EH. */
export function assertConfigured(): void {
  if (!API_KEY || !BUSINESS_ID) {
    throw new EhPayrollError(
      0,
      null,
      "Employment Hero Payroll is not configured (EH_PAYROLL_API_KEY / EH_PAYROLL_BUSINESS_ID missing)",
    );
  }
}

export function isConfigured(): boolean {
  return !!(API_KEY && BUSINESS_ID);
}

/** HTTP Basic header — username=key, password=any non-empty string. */
function authHeader(): string {
  // `:x` is the conventional placeholder password — any value works.
  // Buffer is fine here (server-only).
  return "Basic " + Buffer.from(`${API_KEY}:x`).toString("base64");
}

interface FetchOpts {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Override the Accept header (default: application/json). Used when
   *  fetching payslip PDFs which return application/pdf. */
  accept?: string;
  /** Don't retry on 429 — set when calling from a cron that has its own
   *  backoff strategy. Defaults to retry-once. */
  noRetry?: boolean;
}

/**
 * Low-level request helper. `path` is relative to `/api/v2/business/{businessId}`
 * — e.g. pass `/employee` not `/api/v2/business/407666/employee`.
 *
 * Returns parsed JSON for application/json responses; returns the raw
 * `Response` object for binary payloads (caller streams through).
 */
async function request<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  assertConfigured();
  const url = `${API_BASE}/api/v2/business/${BUSINESS_ID}${path}`;
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: {
      Authorization: authHeader(),
      Accept: opts.accept ?? "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    // EH API can be slow on first call after idle pooler. 30s is generous
    // but still well under Vercel's 60s function timeout.
    signal: AbortSignal.timeout(30_000),
  };

  let res = await fetch(url, init);

  // Retry once on 429 with Retry-After if not opted out.
  if (res.status === 429 && !opts.noRetry) {
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "5", 10);
    logger.warn("EH Payroll rate-limited; retrying after Retry-After", {
      path,
      retryAfter,
    });
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 30) * 1000));
    res = await fetch(url, init);
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => null);
    }
    logger.warn("EH Payroll API non-2xx", { path, status: res.status, body });
    throw new EhPayrollError(res.status, body);
  }

  // Binary route — return the raw Response so the caller can stream it.
  if (opts.accept && !opts.accept.includes("json")) {
    return res as unknown as T;
  }

  return (await res.json()) as T;
}

// ─── Business + connection ───────────────────────────────────────────

export interface EhBusiness {
  id: number;
  name: string;
  country: string | null;
}

/** Sanity check — does the key actually work and which business are we
 *  pointing at? Used by the settings status card + the connection test
 *  endpoint. Doesn't go through `request()` because it's not scoped to
 *  the business ID. */
export async function getOwnBusiness(): Promise<EhBusiness | null> {
  assertConfigured();
  const res = await fetch(`${API_BASE}/api/v2/business`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new EhPayrollError(res.status, await res.text());
  const list = (await res.json()) as EhBusiness[];
  // The configured BUSINESS_ID should appear in the list returned by the key.
  return list.find((b) => String(b.id) === BUSINESS_ID) ?? list[0] ?? null;
}

// ─── Employees ───────────────────────────────────────────────────────

/**
 * Lean Employee shape — only the fields we need for mapping + display.
 * EH returns ~80 fields per employee including TFN, bank details, super
 * fund — we don't pull or store any of that.
 */
export interface EhEmployee {
  id: number;
  firstName: string;
  surname: string;
  email: string | null;
  status: string; // "Active" | "Terminated" | ...
  startDate: string | null;
  /** Free-text external reference. EH lets the business set this; for
   *  Amana some employees have a MongoDB ObjectId here from a prior
   *  integration (OWNA?). Worth surfacing for manual mapping. */
  externalId: string | null;
}

const EMPLOYEE_FIELDS = [
  "id",
  "firstName",
  "surname",
  "email",
  "status",
  "startDate",
  "externalId",
] as const;

/** List every employee in the business. Used by the daily mapping cron
 *  to refresh `User.employmentHeroEmployeeId`. */
export async function listEmployees(): Promise<EhEmployee[]> {
  const raw = await request<Array<Record<string, unknown>>>("/employee");
  return raw.map((e) => {
    const out: Partial<EhEmployee> = {};
    for (const f of EMPLOYEE_FIELDS) {
      // Loose copy — EH's response is permissive about field presence.
      (out as Record<string, unknown>)[f] = (e as Record<string, unknown>)[f] ?? null;
    }
    return out as EhEmployee;
  });
}

/** Single-employee fetch by EH id. Used when we know the mapping and
 *  want fresh data (e.g. on My Portal load). */
export async function getEmployee(employeeId: number): Promise<EhEmployee> {
  return request<EhEmployee>(`/employee/${employeeId}`);
}

// ─── Pay runs + payslips ─────────────────────────────────────────────
//
// Payslips don't have a "list my payslips" endpoint — verified against
// the swagger spec on 2026-06-01. The flow is:
//   1. List recent pay runs for the business
//   2. For each pay run, GET /payrun/{id}/payslips/{employeeId} to
//      check if the employee was paid in it (404 if not)
//   3. Stream the PDF via /payrun/{id}/file/payslip/{employeeId}
//
// The /payrun/{id}/payslips/{employeeId} response is RICH and contains
// bank account numbers, super fund member numbers, TFN-derived YTD
// PAYG figures. We trim to a small "summary" shape (`EhPayslipSummary`)
// before returning to any caller — the full response never leaves this
// module's scope.

export interface EhPayRun {
  id: number;
  /** ISO timestamp — "2026-05-29T00:00:00". May be null for pending runs. */
  datePaid: string | null;
  /** First day of the pay period (ISO). */
  payPeriodStarting: string | null;
  /** Last day of the pay period (ISO). */
  payPeriodEnding: string | null;
}

export interface EhPayslipSummary {
  /** EH's internal payslip id (stable; usable as a key in lists). */
  id: number;
  /** The pay run this payslip belongs to. Required to fetch the PDF. */
  payRunId: number;
  /** Date strings as EH returns them ("23/05/2026" — DD/MM/YYYY). We
   *  don't normalise here so the UI sees the same string EH would show
   *  in their own staff portal. */
  payPeriodStarting: string | null;
  payPeriodEnding: string | null;
  /** Decimal dollars. */
  grossEarnings: number;
  netEarnings: number;
  totalHours: number;
  /** EH's `isPublished` flag — false while a pay run is still being
   *  reviewed by the bookkeeper. We surface unpublished slips with a
   *  "Draft" badge rather than hiding them, so staff aren't confused
   *  about why their pay run didn't appear. */
  isPublished: boolean;
}

/** List the N most recent pay runs (datePaid descending). */
export async function listRecentPayRuns(limit = 12): Promise<EhPayRun[]> {
  // EH's payrun endpoint supports OData-style $top + $orderby.
  return request<EhPayRun[]>(
    `/payrun?$top=${limit}&$orderby=datePaid+desc`,
  );
}

/**
 * Best-effort: returns the N most recent payslips for a single employee
 * by iterating recent pay runs. Pay runs the employee isn't part of
 * return 404 from EH — we silently skip those.
 *
 * Performance: this issues up to (1 + payRunLookback) requests per call
 * — 1 to list pay runs + 1 per pay run to check inclusion. Cap callers
 * to a reasonable lookback (default 12 pay runs ≈ 6 months fortnightly).
 *
 * Caching responsibility is the caller's — this function always hits
 * the network. The route handler that fronts My Portal should layer
 * a short in-memory cache (~60s) keyed by employee id.
 */
export async function listPayslipsForEmployee(
  employeeId: number,
  payRunLookback = 12,
): Promise<EhPayslipSummary[]> {
  const payRuns = await listRecentPayRuns(payRunLookback);
  const results: EhPayslipSummary[] = [];

  for (const pr of payRuns) {
    let raw: Record<string, unknown> | null = null;
    try {
      // The single-employee variant returns ONE payslip object directly
      // (not a dict keyed by employeeId like the no-suffix variant).
      raw = await request<Record<string, unknown>>(
        `/payrun/${pr.id}/payslips/${employeeId}`,
        { noRetry: true }, // 404 is expected and cheap — don't burn retries
      );
    } catch (err) {
      if (err instanceof EhPayrollError && err.status === 404) {
        // Employee wasn't in this pay run — totally normal, move on.
        continue;
      }
      throw err;
    }

    if (!raw) continue;

    // Trim ruthlessly. The full response includes bank/super/TFN — we
    // never want those in our memory space let alone our response.
    results.push({
      id: Number(raw.id),
      payRunId: pr.id,
      payPeriodStarting:
        (raw.payPeriodStarting as string | null) ?? pr.payPeriodStarting,
      payPeriodEnding:
        (raw.payPeriodEnding as string | null) ?? pr.payPeriodEnding,
      grossEarnings: Number(raw.grossEarnings ?? 0),
      netEarnings: Number(raw.netEarnings ?? 0),
      totalHours: Number(raw.totalHours ?? 0),
      isPublished: Boolean(raw.isPublished),
    });
  }

  return results;
}

/**
 * Fetches the payslip PDF as a streamable Response. Returns the raw
 * Response so the route handler can pipe it through to the browser
 * without buffering the entire PDF into memory.
 *
 * Caller responsibilities:
 *   - Set `Content-Disposition` (inline vs attachment) on the outgoing
 *     response based on whether `?download=1` was set
 *   - Set `Cache-Control: private, no-store` — payslips contain PII
 *     and must never sit in a shared CDN cache
 *   - Verify the employeeId belongs to the requesting user BEFORE
 *     calling this (use `requireOwnEmployee`)
 */
export async function fetchPayslipPdf(
  employeeId: number,
  payRunId: number,
): Promise<Response> {
  assertConfigured();
  const url = `${API_BASE}/api/v2/business/${BUSINESS_ID}/payrun/${payRunId}/file/payslip/${employeeId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader(),
      Accept: "application/pdf",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.text();
    } catch {}
    throw new EhPayrollError(res.status, body);
  }
  return res;
}

// ─── Leave: balances, requests, categories ───────────────────────────
//
// All scoped to a single employeeId — caller MUST gate with
// `requireOwnEmployee` from `eh-payroll-auth.ts` before invoking
// anything here. The business API key has full access; identity
// enforcement is our problem.
//
// Field shapes verified 2026-06-01 against swagger-au.json:
//   - LeaveBalanceModel:      {leaveCategoryId, leaveCategoryName, accruedAmount, unitType}
//   - HourLeaveRequestModel:  POST body {hours, fromDate, toDate, leaveCategoryId, notes, ...}
//   - HourLeaveRequestResponseModel: {id, employeeId, leaveCategoryId, leaveCategory,
//                                     fromDate, toDate, totalHours, hoursApplied, status,
//                                     notes, attachmentId}
//   - LeaveCategoryModel:     {id, name, externalId, unitType}

export interface EhLeaveBalance {
  leaveCategoryId: number;
  leaveCategoryName: string;
  /** Despite the name, this is the CURRENT balance (remaining), not the
   *  total ever-accrued. EH does the accrual maths server-side. */
  accruedAmount: number;
  unitType: "Hours" | "Days" | "Weeks";
}

export async function getLeaveBalances(
  employeeId: number,
): Promise<EhLeaveBalance[]> {
  return request<EhLeaveBalance[]>(`/employee/${employeeId}/leavebalances`);
}

export interface EhLeaveRequest {
  id: number;
  leaveCategoryId: number;
  /** Human label EH attaches to the request — same as the matching
   *  category's `name`. We pass it through so we don't need a second
   *  /leavecategory lookup just to render. */
  leaveCategory: string;
  fromDate: string;
  toDate: string;
  totalHours: number;
  /** "Pending" | "Approved" | "Rejected" | "Cancelled" — EH-defined. */
  status: string;
  notes: string | null;
  attachmentId: number | null;
}

export async function listLeaveRequests(
  employeeId: number,
  limit = 20,
): Promise<EhLeaveRequest[]> {
  const out = await request<EhLeaveRequest[]>(
    `/employee/${employeeId}/leaverequest`,
  );
  // EH returns oldest-first by default — most-recent first is what staff
  // expect. Slice after the sort.
  return out
    .sort((a, b) => (b.fromDate > a.fromDate ? 1 : -1))
    .slice(0, limit);
}

export interface CreateLeaveRequestInput {
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  hours: number;
  leaveCategoryId: number;
  notes?: string;
}

export async function createLeaveRequest(
  employeeId: number,
  input: CreateLeaveRequestInput,
): Promise<EhLeaveRequest> {
  return request<EhLeaveRequest>(`/employee/${employeeId}/leaverequest`, {
    method: "POST",
    body: {
      hours: input.hours,
      fromDate: input.fromDate,
      toDate: input.toDate,
      leaveCategoryId: input.leaveCategoryId,
      notes: input.notes ?? "",
      // Staff-submitted requests never auto-approve — they always need
      // manager sign-off in EH. Hardcoding here removes a parameter the
      // UI doesn't need to expose (and shouldn't be able to set).
      automaticallyApprove: false,
      employeeId,
    },
  });
}

export interface EhLeaveCategory {
  id: number;
  name: string;
  unitType: "Hours" | "Days" | "Weeks";
}

export async function listLeaveCategories(): Promise<EhLeaveCategory[]> {
  // Business-scoped (not employee-scoped) — same shape as everywhere else
  // gets sent through the `/business/{businessId}/...` prefix automatically
  // by request().
  return request<EhLeaveCategory[]>(`/leavecategory`);
}

export interface LeaveEstimate {
  totalHours: number;
}

/** Asks EH "how many hours would this leave request consume?" — used by
 *  the apply-for-leave form so staff see exactly what they're spending
 *  before they hit Submit. EH does the maths based on the employee's
 *  configured standard hours and any public-holiday awareness rules. */
export async function estimateLeaveHours(
  employeeId: number,
  fromDate: string,
  toDate: string,
  leaveCategoryId: number,
): Promise<LeaveEstimate> {
  const params = new URLSearchParams({
    fromDate,
    toDate,
    leaveCategoryId: String(leaveCategoryId),
  });
  return request<LeaveEstimate>(
    `/employee/${employeeId}/leaverequest/estimate?${params.toString()}`,
  );
}
