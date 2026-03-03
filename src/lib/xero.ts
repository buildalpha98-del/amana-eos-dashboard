import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID || "";
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET || "";
const XERO_REDIRECT_URI = process.env.XERO_REDIRECT_URI || "";
const ENCRYPTION_KEY = process.env.XERO_ENCRYPTION_KEY || "";

const XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

const SCOPES = [
  "openid",
  "profile",
  "email",
  "accounting.reports.read",
  "accounting.settings.read",
  "offline_access",
].join(" ");

// ─── Token Encryption (AES-256-GCM) ─────────────────────────────────────────

function getKeyBuffer(): Buffer {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
    throw new Error("XERO_ENCRYPTION_KEY must be at least 32 hex characters");
  }
  return Buffer.from(ENCRYPTION_KEY.slice(0, 64), "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("hex"),
    encrypted.toString("hex"),
    authTag.toString("hex"),
  ].join(":");
}

export function decryptToken(ciphertext: string): string {
  const key = getKeyBuffer();
  const [ivHex, encryptedHex, authTagHex] = ciphertext.split(":");
  if (!ivHex || !encryptedHex || !authTagHex) {
    throw new Error("Invalid encrypted token format");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// ─── OAuth Helpers ───────────────────────────────────────────────────────────

export function getXeroAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: XERO_CLIENT_ID,
    redirect_uri: XERO_REDIRECT_URI,
    scope: SCOPES,
    state,
  });
  return `${XERO_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: XERO_REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
  }>;
}

export async function fetchXeroConnections(accessToken: string) {
  const res = await fetch(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch Xero connections");
  }

  return res.json() as Promise<
    { tenantId: string; tenantName: string; tenantType: string }[]
  >;
}

// ─── Token Management ────────────────────────────────────────────────────────

async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  return res.json();
}

export async function getValidAccessToken(): Promise<string> {
  const conn = await prisma.xeroConnection.findUnique({
    where: { id: "singleton" },
  });

  if (!conn || !conn.refreshToken || conn.status === "disconnected") {
    throw new Error("Xero is not connected");
  }

  // Check if token is still valid (with 5-minute buffer)
  const bufferMs = 5 * 60 * 1000;
  if (
    conn.accessToken &&
    conn.tokenExpiresAt &&
    conn.tokenExpiresAt.getTime() - Date.now() > bufferMs
  ) {
    return decryptToken(conn.accessToken);
  }

  // Refresh the token
  const decryptedRefresh = decryptToken(conn.refreshToken);
  const tokens = await refreshAccessToken(decryptedRefresh);

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.xeroConnection.update({
    where: { id: "singleton" },
    data: {
      accessToken: encryptToken(tokens.access_token),
      refreshToken: encryptToken(tokens.refresh_token),
      tokenExpiresAt: expiresAt,
    },
  });

  return tokens.access_token;
}

// ─── Authenticated API Requests ──────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function xeroApiRequest(
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
    const res = await fetch(`${XERO_API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Xero-Tenant-Id": conn.tenantId,
        Accept: "application/json",
        ...options?.headers,
      },
    });

    if (res.status === 429) {
      // Rate limited — wait and retry
      const retryAfter = parseInt(res.headers.get("Retry-After") || "5", 10);
      await sleep(retryAfter * 1000);
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Xero API error (${res.status}): ${errText.slice(0, 500)}`
      );
    }

    return res.json();
  }

  throw new Error("Xero API: max retries exceeded due to rate limiting");
}
