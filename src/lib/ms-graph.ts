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

const TENANT = process.env.MS_GRAPH_TENANT_ID || "";
const CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID || "";
const CLIENT_SECRET = process.env.MS_GRAPH_CLIENT_SECRET || "";
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
    const body = await res.json().catch(() => null);
    throw new GraphError(res.status, body, "Couldn't sign in to Microsoft 365 — check the app registration");
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
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
