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
