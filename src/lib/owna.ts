/**
 * OWNA Childcare Management API Client
 *
 * Wraps the OWNA Custom Integration API (enterprise tier).
 * Handles authentication, retries with exponential backoff,
 * rate-limit awareness, and structured error logging.
 */

// ── Types ──────────────────────────────────────────────────────

export interface OwnaAttendanceRecord {
  date: string;
  sessionType: "BSC" | "ASC" | "VC";
  enrolled: number;
  attended: number;
  absent: number;
  casual: number;
  capacity: number;
}

export interface OwnaBookingRecord {
  date: string;
  sessionType: "BSC" | "ASC" | "VC";
  regular: number;
  casual: number;
  total: number;
  capacity: number;
}

export interface OwnaEnrolment {
  childId: string;
  childName: string;
  familyName: string;
  sessionTypes: ("BSC" | "ASC" | "VC")[];
  status: string;
  startDate: string;
  endDate?: string;
}

export interface OwnaRosterShift {
  date: string;
  sessionType: "BSC" | "ASC" | "VC";
  staffName: string;
  shiftStart: string; // "HH:mm"
  shiftEnd: string; // "HH:mm"
  role?: string;
}

export interface OwnaCCSRecord {
  date: string;
  sessionType: "BSC" | "ASC" | "VC";
  totalFees: number;
  ccsAmount: number;
  gapFee: number;
  status: "paid" | "pending" | "rejected";
}

export class OwnaApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public retryable: boolean,
  ) {
    super(message);
    this.name = "OwnaApiError";
  }
}

// ── Client ─────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export class OwnaClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = (baseUrl || process.env.OWNA_API_URL || "").replace(
      /\/$/,
      "",
    );
    this.apiKey = apiKey || process.env.OWNA_API_KEY || "";

    if (!this.baseUrl) throw new Error("OWNA_API_URL is not configured");
    if (!this.apiKey) throw new Error("OWNA_API_KEY is not configured");
  }

  // ── Core request with retry + rate-limit handling ──────────

  private async request<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = Math.random() * delay * 0.1;
        await new Promise((r) => setTimeout(r, delay + jitter));
      }

      try {
        const res = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: "application/json",
          },
        });

        // Rate limited — back off and retry
        if (res.status === 429) {
          const retryAfter = res.headers.get("retry-after");
          const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(
            `[OWNA] Rate limited on ${path}, waiting ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
          );
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          const retryable = res.status >= 500 || res.status === 408;

          if (!retryable || attempt === MAX_RETRIES) {
            throw new OwnaApiError(
              `OWNA API error ${res.status}: ${body || res.statusText}`,
              res.status,
              retryable,
            );
          }

          lastError = new OwnaApiError(
            `OWNA API error ${res.status}: ${body || res.statusText}`,
            res.status,
            true,
          );
          console.warn(
            `[OWNA] Retryable error on ${path}: ${res.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
          );
          continue;
        }

        return (await res.json()) as T;
      } catch (err) {
        if (err instanceof OwnaApiError && !err.retryable) throw err;

        lastError =
          err instanceof Error ? err : new Error(String(err));

        if (attempt === MAX_RETRIES) break;

        console.warn(
          `[OWNA] Network error on ${path}: ${lastError.message} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
        );
      }
    }

    throw (
      lastError ||
      new Error(`OWNA API request failed after ${MAX_RETRIES + 1} attempts`)
    );
  }

  // ── API Methods ────────────────────────────────────────────

  /** Daily attendance by session type (BSC/ASC/VC). */
  async getAttendance(
    serviceCode: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<OwnaAttendanceRecord[]> {
    return this.request<OwnaAttendanceRecord[]>(
      `/services/${serviceCode}/attendance`,
      { dateFrom, dateTo },
    );
  }

  /** Current and future bookings (regular vs casual). */
  async getBookings(
    serviceCode: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<OwnaBookingRecord[]> {
    return this.request<OwnaBookingRecord[]>(
      `/services/${serviceCode}/bookings`,
      { dateFrom, dateTo },
    );
  }

  /** Active enrolments with child/family details. */
  async getEnrolments(serviceCode: string): Promise<OwnaEnrolment[]> {
    return this.request<OwnaEnrolment[]>(
      `/services/${serviceCode}/enrolments`,
    );
  }

  /** Staff rostered shifts for a date range. */
  async getRoster(
    serviceCode: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<OwnaRosterShift[]> {
    return this.request<OwnaRosterShift[]>(
      `/services/${serviceCode}/roster`,
      { dateFrom, dateTo },
    );
  }

  /** CCS payment status for a date range. */
  async getCCSData(
    serviceCode: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<OwnaCCSRecord[]> {
    return this.request<OwnaCCSRecord[]>(
      `/services/${serviceCode}/ccs`,
      { dateFrom, dateTo },
    );
  }
}

// ── Singleton accessor ───────────────────────────────────────

let _client: OwnaClient | null = null;

/**
 * Get or create a singleton OwnaClient.
 * Returns `null` if env vars are not configured (safe for cron).
 */
export function getOwnaClient(): OwnaClient | null {
  if (_client) return _client;

  if (!process.env.OWNA_API_URL || !process.env.OWNA_API_KEY) {
    return null;
  }

  _client = new OwnaClient();
  return _client;
}
