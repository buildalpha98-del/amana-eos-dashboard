/**
 * Microsoft Graph client — app-only (client credentials), server-side.
 *
 * 2026-10-08: first use is reading the SharePoint policies folder
 * (src/lib/sharepoint-policies.ts). Needs an Entra ID app registration
 * with application permission to read the site (Sites.Selected granted on
 * the one site, or Sites.Read.All) and these env vars:
 *   MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET
 * Unset = not configured; callers skip quietly.
 */
import { logger } from "@/lib/logger";

// Trimmed, and stripped of wrapping quotes: a value pasted into Vercel with
// a trailing space or "quotes" fails sign-in with no visible difference.
const env = (k: string) => (process.env[k] || "").trim().replace(/^["']|["']$/g, "");
const TENANT = env("MS_GRAPH_TENANT_ID");
const CLIENT_ID = env("MS_GRAPH_CLIENT_ID");
const CLIENT_SECRET = env("MS_GRAPH_CLIENT_SECRET");
const GRAPH = "https://graph.microsoft.com/v1.0";

export function isGraphConfigured(): boolean {
  return !!(TENANT && CLIENT_ID && CLIENT_SECRET);
}

export class GraphError extends Error {
  constructor(public status: number, public body: unknown, message?: string) {
    super(message ?? `Microsoft Graph error: HTTP ${status}`);
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function token(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; error_description?: string } | null;
    logger.warn("Graph token refused", { status: res.status, error: body?.error, description: body?.error_description?.split("\r\n")[0] });
    throw new GraphError(res.status, body, signInFailureMessage(body));
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/**
 * Turn Microsoft's sign-in refusal into the one thing to fix. The AADSTS
 * code is what tells the cases apart; the description never contains the
 * secret, so it's safe to show the office.
 */
export function signInFailureMessage(
  body: { error?: string; error_description?: string } | null,
): string {
  const desc = body?.error_description ?? "";
  const code = desc.match(/AADSTS\d+/)?.[0] ?? "";
  const why: Record<string, string> = {
    AADSTS7000215:
      "the client secret is wrong. In Vercel, MS_GRAPH_CLIENT_SECRET must be the secret's VALUE (not the Secret ID).",
    AADSTS7000222: "the client secret has expired. Make a new one in Entra → Certificates & secrets and update Vercel.",
    AADSTS700016: "no app with that client ID in this tenant. Check MS_GRAPH_CLIENT_ID (and MS_GRAPH_TENANT_ID).",
    AADSTS90002: "that tenant wasn't found. Check MS_GRAPH_TENANT_ID.",
    AADSTS900023: "the tenant ID isn't valid. Check MS_GRAPH_TENANT_ID.",
    AADSTS50034: "the tenant ID isn't valid. Check MS_GRAPH_TENANT_ID.",
  };
  const reason = why[code] ?? (desc.split("\r\n")[0] || body?.error || "Microsoft refused the sign-in.");
  return `Couldn't sign in to Microsoft 365 — ${reason}${code && !why[code] ? "" : code ? ` (${code})` : ""}`;
}

/** GET a Graph path (or absolute @odata.nextLink) as JSON. */
export async function graphGet<T>(pathOrUrl: string): Promise<T> {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH}${pathOrUrl}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await token()}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    logger.warn("Graph non-2xx", { url: pathOrUrl, status: res.status });
    // Signed in fine, but not allowed to read: the app's Sites.Read.All
    // permission hasn't had admin consent (or was removed).
    if (res.status === 401 || res.status === 403) {
      throw new GraphError(
        res.status,
        body,
        "Signed in to Microsoft 365, but SharePoint access isn't approved — in Entra, open the app's API permissions and Grant admin consent (Sites.Read.All, Application).",
      );
    }
    throw new GraphError(res.status, body);
  }
  return (await res.json()) as T;
}

export interface DriveItem {
  id: string;
  name: string;
  eTag?: string;
  cTag?: string;
  webUrl: string;
  size?: number;
  lastModifiedDateTime: string;
  file?: { mimeType?: string };
  folder?: { childCount: number };
  parentReference?: { path?: string };
}

/** Every file under a folder, recursively, skipping folders `skipFolder` rejects. */
export async function listFolderFiles(
  driveId: string,
  folderPath: string,
  skipFolder: (name: string) => boolean,
): Promise<DriveItem[]> {
  const out: DriveItem[] = [];
  const encoded = folderPath.split("/").map(encodeURIComponent).join("/");
  const queue: string[] = [`/drives/${driveId}/root:/${encoded}:/children?$top=200`];
  let guard = 0;
  while (queue.length && guard++ < 500) {
    let next: string | undefined = queue.shift();
    while (next) {
      const page: { value: DriveItem[]; "@odata.nextLink"?: string } = await graphGet(next);
      for (const item of page.value) {
        if (item.folder) {
          if (!skipFolder(item.name)) queue.push(`/drives/${driveId}/items/${item.id}/children?$top=200`);
        } else if (item.file) {
          out.push(item);
        }
      }
      next = page["@odata.nextLink"];
    }
  }
  return out;
}

/**
 * The file as a PDF. Office documents are converted by Graph
 * (`?format=pdf`); PDFs are fetched as-is. Graph answers with a redirect to
 * a pre-authenticated download URL, which fetch follows (dropping our
 * Authorization header on the cross-origin hop, as it should).
 */
export async function downloadAsPdf(driveId: string, item: DriveItem): Promise<Buffer> {
  const isPdf = /\.pdf$/i.test(item.name);
  const res = await fetch(
    `${GRAPH}/drives/${driveId}/items/${item.id}/content${isPdf ? "" : "?format=pdf"}`,
    { headers: { Authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(60_000) },
  );
  if (!res.ok) throw new GraphError(res.status, null, `Couldn't convert ${item.name} to PDF`);
  return Buffer.from(await res.arrayBuffer());
}
