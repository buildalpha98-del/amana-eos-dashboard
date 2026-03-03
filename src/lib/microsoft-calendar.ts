/**
 * Microsoft Outlook Calendar integration via Microsoft Graph API.
 *
 * Prerequisites:
 *  1. Register an app in Azure AD (portal.azure.com → App registrations)
 *  2. Set redirect URI to: {NEXTAUTH_URL}/api/calendar/callback
 *  3. Add delegated permissions: Calendars.ReadWrite, User.Read, offline_access
 *  4. Create a client secret
 *  5. Add env vars:
 *       AZURE_AD_CLIENT_ID=<your-app-id>
 *       AZURE_AD_CLIENT_SECRET=<your-secret>
 *       AZURE_AD_TENANT_ID=<your-tenant-id>  (or "common" for multi-tenant)
 *
 * Flow:
 *  - User clicks "Connect Calendar" → redirects to Microsoft login
 *  - Microsoft redirects back with an auth code
 *  - We exchange code for tokens and store them in CalendarIntegration
 *  - API routes use tokens to read/write calendar events via Graph
 */

import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import { prisma } from "@/lib/prisma";

// ── Config ───────────────────────────────────────────────

const SCOPES = [
  "Calendars.ReadWrite",
  "User.Read",
  "offline_access",
];

function getMsalConfig() {
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;
  const tenantId = process.env.AZURE_AD_TENANT_ID || "common";

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  };
}

function getRedirectUri() {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${baseUrl}/api/calendar/callback`;
}

// ── MSAL Client ──────────────────────────────────────────

let _cca: ConfidentialClientApplication | null = null;

function getMsalClient(): ConfidentialClientApplication | null {
  if (_cca) return _cca;
  const config = getMsalConfig();
  if (!config) return null;
  _cca = new ConfidentialClientApplication(config);
  return _cca;
}

// ── Auth Helpers ─────────────────────────────────────────

/** Generate the Microsoft login URL */
export function getAuthUrl(state: string): string | null {
  const config = getMsalConfig();
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: config.auth.clientId,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
  });

  return `${config.auth.authority}/oauth2/v2.0/authorize?${params}`;
}

/** Exchange auth code for tokens */
export async function exchangeCodeForTokens(code: string) {
  const cca = getMsalClient();
  if (!cca) throw new Error("Calendar integration not configured");

  const result = await cca.acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri: getRedirectUri(),
  });

  return {
    accessToken: result.accessToken,
    expiresAt: result.expiresOn || new Date(Date.now() + 3600 * 1000),
    // MSAL v2 doesn't directly expose refresh_token in the result,
    // but it caches it internally. We also fetch it from the token cache.
    account: result.account,
  };
}

/** Refresh tokens using the cached refresh token */
export async function refreshAccessToken(userId: string): Promise<string | null> {
  const integration = await prisma.calendarIntegration.findUnique({
    where: { userId },
  });

  if (!integration) return null;

  const config = getMsalConfig();
  if (!config) return null;

  try {
    // Use the refresh token directly with a token request
    const baseUrl = `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID || "common"}`;
    const tokenUrl = `${baseUrl}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: config.auth.clientId,
      client_secret: config.auth.clientSecret,
      grant_type: "refresh_token",
      refresh_token: integration.refreshToken,
      scope: SCOPES.join(" "),
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      console.error("[CALENDAR] Token refresh failed:", await res.text());
      return null;
    }

    const data = await res.json();

    // Update stored tokens
    await prisma.calendarIntegration.update({
      where: { userId },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || integration.refreshToken,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    });

    return data.access_token;
  } catch (err) {
    console.error("[CALENDAR] Token refresh error:", err);
    return null;
  }
}

// ── Graph Client ─────────────────────────────────────────

/** Get an authenticated Graph client for a user */
export async function getGraphClient(userId: string): Promise<Client | null> {
  const integration = await prisma.calendarIntegration.findUnique({
    where: { userId },
  });

  if (!integration) return null;

  let accessToken = integration.accessToken;

  // Refresh if expired (with 5-min buffer)
  if (new Date() >= new Date(integration.expiresAt.getTime() - 5 * 60 * 1000)) {
    const refreshed = await refreshAccessToken(userId);
    if (!refreshed) return null;
    accessToken = refreshed;
  }

  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

// ── Calendar Operations ──────────────────────────────────

export interface CalendarEvent {
  id?: string;
  subject: string;
  body?: { contentType: "HTML" | "Text"; content: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName: string };
  attendees?: { emailAddress: { address: string; name?: string }; type: "required" | "optional" }[];
  isOnlineMeeting?: boolean;
  onlineMeetingProvider?: "teamsForBusiness";
  recurrence?: unknown;
}

/** List calendar events in a date range */
export async function listEvents(
  userId: string,
  startDate: string,
  endDate: string
): Promise<CalendarEvent[] | null> {
  const client = await getGraphClient(userId);
  if (!client) return null;

  try {
    const result = await client
      .api("/me/calendarview")
      .query({
        startDateTime: startDate,
        endDateTime: endDate,
        $top: 100,
        $orderby: "start/dateTime",
        $select: "id,subject,body,start,end,location,attendees,isOnlineMeeting,onlineMeetingUrl,recurrence",
      })
      .get();

    return result.value;
  } catch (err) {
    console.error("[CALENDAR] List events error:", err);
    return null;
  }
}

/** Create a calendar event */
export async function createEvent(
  userId: string,
  event: CalendarEvent
): Promise<CalendarEvent | null> {
  const client = await getGraphClient(userId);
  if (!client) return null;

  try {
    return await client.api("/me/events").post(event);
  } catch (err) {
    console.error("[CALENDAR] Create event error:", err);
    return null;
  }
}

/** Update a calendar event */
export async function updateEvent(
  userId: string,
  eventId: string,
  updates: Partial<CalendarEvent>
): Promise<CalendarEvent | null> {
  const client = await getGraphClient(userId);
  if (!client) return null;

  try {
    return await client.api(`/me/events/${eventId}`).patch(updates);
  } catch (err) {
    console.error("[CALENDAR] Update event error:", err);
    return null;
  }
}

/** Delete a calendar event */
export async function deleteEvent(
  userId: string,
  eventId: string
): Promise<boolean> {
  const client = await getGraphClient(userId);
  if (!client) return false;

  try {
    await client.api(`/me/events/${eventId}`).delete();
    return true;
  } catch (err) {
    console.error("[CALENDAR] Delete event error:", err);
    return false;
  }
}

/** Check if calendar is configured in environment */
export function isCalendarConfigured(): boolean {
  return !!(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET);
}

/** Check if user has connected their calendar */
export async function isCalendarConnected(userId: string): Promise<boolean> {
  const integration = await prisma.calendarIntegration.findUnique({
    where: { userId },
    select: { id: true },
  });
  return !!integration;
}
