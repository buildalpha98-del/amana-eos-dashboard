/**
 * OWNA Childcare Management API Client
 *
 * Wraps the OWNA public REST API (https://api.owna.com.au).
 * Auth: x-api-key header.
 * Handles retries with exponential backoff and rate-limit awareness.
 *
 * Real API endpoints discovered from Swagger + live testing (March 2026).
 */

import { logger } from "@/lib/logger";

// ── Response wrapper ──────────────────────────────────────────

interface OwnaListResponse<T> {
  data: T[];
  totalCount: number;
  errors: string | null;
}

// ── Types matching real OWNA API responses ────────────────────

export interface OwnaCentre {
  id: string;
  name: string;
  alias: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  email: string;
  phone: string;
  publicEmail: string;
  publicPhone: string;
  logo: string | null;
  serviceType: string;
  children: number;
  casualBookings: boolean;
  openingtime: string;
  closingtime: string;
  serviceApprovalNumber: string;
  lastUpdated: string;
  dateAdded: string;
}

export interface OwnaChild {
  id: string;
  centreId: string;
  centre: string;
  room: string;
  roomId: string;
  firstname: string;
  middlename: string;
  surname: string;
  dob: string | null;
  dobday: number;
  dobmonth: number;
  gender: string;
  crn: string | null;
  attending: boolean;
  activeFrom: string | null;
  finishDate: string | null;
  parentIds: string[];
  // Booking days
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  // Alt days
  mondayAlt: boolean;
  tuesdayAlt: boolean;
  wednesdayAlt: boolean;
  thursdayAlt: boolean;
  fridayAlt: boolean;
  saturdayAlt: boolean;
  sundayAlt: boolean;
  // Medical & demographics
  indigenous: boolean;
  indigenousStatus: string | null;
  streetAddress: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  mainLanguageAtHome: string | null;
  countryOfBirth: { countryId: string; name: string } | null;
  disabilities: string | null;
  lastUpdated: string;
}

export interface OwnaAttendanceRecord {
  id: string;
  centreId: string;
  centre: string;
  room: string;
  roomId: string;
  child: string;
  childId: string;
  attending: boolean;
  signIn: string;
  signOut: string;
  signInParent: string;
  signInParentId: string;
  signOutParent: string;
  signOutParentId: string;
  comments: string;
  attendanceDate: string; // "YYYY-MM-DD"
  sessionOfCare: string; // "HH:mm-HH:mm"
  fee: number;
  audit: string;
  dateAdded: string;
}

export interface OwnaEnquiry {
  id: string;
  centreid: string;
  centre: string;
  firstname: string;
  surname: string;
  phone: string;
  email: string;
  enquiry: string;
  child1: string;
  child1Dob: string;
  child2: string;
  child2Dob: string;
  startdate: string;
  notes: string | null;
  lastupdated: string | null;
  staffassigned: string | null;
  status: string | null;
  unsubscribe: boolean | null;
  tourbookingid: string | null;
  archived: boolean | null;
  dateAdded: string;
}

export interface OwnaIncident {
  id: string;
  childId: string;
  child: string;
  childDob: string;
  childGender: string;
  centreId: string;
  centre: string;
  staffid: string;
  staffName: string;
  position: string;
  incidentDate: string; // "YYYY-MM-DD HH:mm AM/PM"
  location: string;
  generalActivity: string;
  injurytrauma: string;
  illness: string;
  missing: string;
  takenOrRemoved: string;
  actionTaken: string;
  emergencyServices: boolean;
  medicalAttention: boolean;
  actionTakenDetails: string;
  stepsTaken: string;
  parentNotified: string;
  parentNotifiedDatetime: string;
  directorNotified: string;
  directorNotifiedDatetime: string;
  additionalNotes: string;
  affected: string[];
  mediaUrl: string;
  dateAdded: string;
}

export interface OwnaStaff {
  id: string;
  centreId: string;
  centre: string;
  firstname: string;
  surname: string;
  staffType: string;
  username: string;
  emailAddress: string;
  picture: string | null;
  contactNumber: string | null;
  dateOfBirth: string | null;
  inactive: boolean;
  hourlyRate: number | null;
  empType: string | null;
  employeeCode: string | null;
  dateAdded: string;
}

export interface OwnaRoom {
  id: string;
  centreId: string;
  centre: string;
  name: string;
  picture: string;
  capacity: number;
  rate: number;
  order: number;
  ratio: number;
  disabled: boolean;
  dateAdded: string;
}

export interface OwnaFamily {
  id: string;
  accountName: string;
  centreId: string;
  centre: string;
  parentsId: string[];
  parentsName: string[];
  childrenId: string[];
  childrenName: string[];
  loyaltyPoints: number;
  inactive: boolean;
  outstanding: number;
  outstandingdate: string;
  dateAdded: string;
}

// Legacy types kept for backward compatibility with existing cron
export interface OwnaBookingRecord {
  date: string;
  sessionType: "BSC" | "ASC" | "VC";
  regular: number;
  casual: number;
  total: number;
  capacity: number;
}

export interface OwnaRosterShift {
  date: string;
  sessionType: "BSC" | "ASC" | "VC";
  staffName: string;
  shiftStart: string;
  shiftEnd: string;
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
            "x-api-key": this.apiKey,
            Accept: "application/json",
          },
        });

        // Rate limited — back off and retry
        if (res.status === 429) {
          const retryAfter = res.headers.get("retry-after");
          const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : BASE_DELAY_MS * Math.pow(2, attempt);
          logger.warn("OWNA rate limited, backing off", { path, waitMs, attempt: attempt + 1, maxAttempts: MAX_RETRIES + 1 });
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
          logger.warn("OWNA retryable error", { path, status: res.status, attempt: attempt + 1, maxAttempts: MAX_RETRIES + 1 });
          continue;
        }

        return (await res.json()) as T;
      } catch (err) {
        if (err instanceof OwnaApiError && !err.retryable) throw err;

        lastError =
          err instanceof Error ? err : new Error(String(err));

        if (attempt === MAX_RETRIES) break;

        logger.warn("OWNA network error, retrying", { path, error: lastError.message, attempt: attempt + 1, maxAttempts: MAX_RETRIES + 1 });
      }
    }

    throw (
      lastError ||
      new Error(`OWNA API request failed after ${MAX_RETRIES + 1} attempts`)
    );
  }

  // ── Helper to unwrap { data: T[] } responses ────────────────

  private async requestList<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<T[]> {
    const response = await this.request<OwnaListResponse<T> | T[]>(path, params);
    // Some endpoints return { data: [...] }, others return [...] directly
    if (Array.isArray(response)) return response;
    return response.data ?? [];
  }

  // ── API Methods — Real OWNA endpoints ────────────────────────

  /** List all centres the API key has access to. */
  async getCentres(): Promise<OwnaCentre[]> {
    return this.requestList<OwnaCentre>("/api/centre/list");
  }

  /** Get children enrolled at a centre. */
  async getChildren(centreId: string, attending?: boolean): Promise<OwnaChild[]> {
    const params: Record<string, string> = {};
    if (attending !== undefined) params.attending = String(attending);
    return this.requestList<OwnaChild>(`/api/children/${centreId}/list`, params);
  }

  /** Get per-child attendance records for a centre + date range. */
  async getAttendance(
    centreId: string,
    startDate: string,
    endDate: string,
  ): Promise<OwnaAttendanceRecord[]> {
    return this.requestList<OwnaAttendanceRecord>(
      `/api/attendance/${centreId}/${startDate}/${endDate}`,
      { sort: "attendanceDate", take: "1000", skip: "0" },
    );
  }

  /** Get enquiries for a centre. */
  async getEnquiries(centreId: string): Promise<OwnaEnquiry[]> {
    return this.requestList<OwnaEnquiry>(`/api/enquiries/${centreId}/list`);
  }

  /** Get enquiries for a centre within a date range. */
  async getEnquiriesByDate(
    centreId: string,
    startDate: string,
    endDate: string,
  ): Promise<OwnaEnquiry[]> {
    return this.requestList<OwnaEnquiry>(
      `/api/enquiries/${centreId}/${startDate}/${endDate}/list`,
    );
  }

  /** Get incident reports for a centre within a date range. */
  async getIncidents(
    centreId: string,
    fromDate: string,
    toDate: string,
  ): Promise<OwnaIncident[]> {
    return this.requestList<OwnaIncident>(
      `/api/children/incident/${centreId}/${fromDate}/${toDate}`,
      { sort: "CentreId", take: "1000", skip: "0" },
    );
  }

  /** Get staff list for a centre. */
  async getStaff(centreId: string): Promise<OwnaStaff[]> {
    return this.requestList<OwnaStaff>(`/api/staff/${centreId}/list`);
  }

  /** Get rooms for a centre. */
  async getRooms(centreId: string): Promise<OwnaRoom[]> {
    return this.requestList<OwnaRoom>(`/api/room/${centreId}/list`);
  }

  /** Get families for a centre. */
  async getFamilies(centreId: string): Promise<OwnaFamily[]> {
    return this.requestList<OwnaFamily>(`/api/family/${centreId}/list`);
  }

  /** Get casual bookings for a centre + date range. */
  async getCasualBookings(
    centreId: string,
    startDate: string,
    endDate: string,
  ): Promise<unknown[]> {
    return this.requestList<unknown>(
      `/api/casualbookings/${centreId}/${startDate}/${endDate}/list`,
    );
  }

  // ── Legacy methods (kept for backward compat with existing cron) ──

  /** @deprecated Use getAttendance(centreId, ...) instead */
  async getLegacyAttendance(
    _serviceCode: string,
    _dateFrom: string,
    _dateTo: string,
  ): Promise<OwnaBookingRecord[]> {
    logger.warn("OWNA getLegacyAttendance is deprecated — use getAttendance()");
    return [];
  }

  /** @deprecated Use getCasualBookings(centreId, ...) instead */
  async getBookings(
    _serviceCode: string,
    _dateFrom: string,
    _dateTo: string,
  ): Promise<OwnaBookingRecord[]> {
    logger.warn("OWNA getBookings is deprecated — use getCasualBookings()");
    return [];
  }

  /** @deprecated No longer available via public API */
  async getEnrolments(_serviceCode: string): Promise<OwnaChild[]> {
    logger.warn("OWNA getEnrolments is deprecated — use getChildren()");
    return [];
  }

  /** @deprecated Use getStaff(centreId) instead */
  async getRoster(
    _serviceCode: string,
    _dateFrom: string,
    _dateTo: string,
  ): Promise<OwnaRosterShift[]> {
    logger.warn("OWNA getRoster is deprecated — use getStaff()");
    return [];
  }

  /** @deprecated Not yet available on public API */
  async getCCSData(
    _serviceCode: string,
    _dateFrom: string,
    _dateTo: string,
  ): Promise<OwnaCCSRecord[]> {
    logger.warn("OWNA getCCSData — not yet available on public API");
    return [];
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
