import crypto from "crypto";

const META_APP_ID = process.env.META_APP_ID || "";
const META_APP_SECRET = process.env.META_APP_SECRET || "";
const META_ENCRYPTION_KEY = process.env.META_ENCRYPTION_KEY || "";
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || "";
const GRAPH_API = "https://graph.facebook.com/v21.0";

// ─── Token Encryption (AES-256-GCM) ─────────────────────────────────────────

function getKeyBuffer(): Buffer {
  if (!META_ENCRYPTION_KEY || META_ENCRYPTION_KEY.length < 32) {
    throw new Error("META_ENCRYPTION_KEY must be at least 32 hex characters");
  }
  return Buffer.from(META_ENCRYPTION_KEY.slice(0, 64), "hex");
}

export function encryptToken(token: string): string {
  const key = getKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("hex"),
    encrypted.toString("hex"),
    authTag.toString("hex"),
  ].join(":");
}

export function decryptToken(encryptedStr: string): string {
  const key = getKeyBuffer();
  const [ivHex, encHex, tagHex] = encryptedStr.split(":");
  if (!ivHex || !encHex || !tagHex) {
    throw new Error("Invalid encrypted token format");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// ─── OAuth Helpers ───────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!(META_APP_ID && META_APP_SECRET && META_REDIRECT_URI && META_ENCRYPTION_KEY);
}

export function getMetaAuthUrl(state: string): string {
  if (!META_APP_ID || !META_REDIRECT_URI) {
    throw new Error("Meta OAuth is not configured (missing META_APP_ID or META_REDIRECT_URI)");
  }
  const scopes =
    "pages_show_list,pages_read_engagement,pages_read_user_content,instagram_basic,instagram_manage_insights";
  return `https://www.facebook.com/v21.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}&state=${state}&scope=${scopes}&response_type=code`;
}

export async function exchangeCodeForTokens(code: string) {
  if (!META_APP_ID || !META_APP_SECRET || !META_REDIRECT_URI) {
    throw new Error("Meta OAuth is not configured");
  }
  const url = `${GRAPH_API}/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}&code=${code}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token exchange failed: ${errText}`);
  }
  return res.json() as Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }>;
}

export async function getLongLivedToken(shortToken: string) {
  if (!META_APP_ID || !META_APP_SECRET) {
    throw new Error("Meta OAuth is not configured");
  }
  const url = `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${shortToken}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Long-lived token exchange failed: ${errText}`);
  }
  return res.json() as Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }>;
}

export async function getPageAccessTokens(userToken: string) {
  const url = `${GRAPH_API}/me/accounts?access_token=${userToken}&fields=id,name,access_token,category`;
  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to fetch pages: ${errText}`);
  }
  const data = await res.json();
  return (data.data || []) as Array<{
    id: string;
    name: string;
    access_token: string;
    category: string;
  }>;
}

export async function getInstagramAccounts(
  pageId: string,
  pageToken: string
) {
  const url = `${GRAPH_API}/${pageId}?fields=instagram_business_account{id,name,username,profile_picture_url}&access_token=${pageToken}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.instagram_business_account as
    | {
        id: string;
        name: string;
        username: string;
        profile_picture_url: string;
      }
    | undefined;
}

export async function fetchPostMetrics(
  token: string,
  postId: string,
  platform: "facebook" | "instagram"
) {
  try {
    if (platform === "facebook") {
      const url = `${GRAPH_API}/${postId}?fields=likes.summary(true),comments.summary(true),shares,insights.metric(post_impressions_unique)&access_token=${token}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      return {
        likes:
          (data.likes?.summary?.total_count as number | undefined) || 0,
        comments:
          (data.comments?.summary?.total_count as number | undefined) || 0,
        shares: (data.shares?.count as number | undefined) || 0,
        reach:
          (data.insights?.data?.[0]?.values?.[0]?.value as
            | number
            | undefined) || 0,
      };
    } else {
      const url = `${GRAPH_API}/${postId}/insights?metric=impressions,reach,likes,comments&access_token=${token}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const metrics: Record<string, number> = {};
      (
        data.data as
          | { name: string; values: { value: number }[] }[]
          | undefined
      )?.forEach((m) => {
        metrics[m.name] = m.values?.[0]?.value || 0;
      });
      return {
        likes: metrics.likes || 0,
        comments: metrics.comments || 0,
        shares: 0,
        reach: metrics.reach || 0,
      };
    }
  } catch {
    return null;
  }
}

export async function fetchRecentPosts(
  token: string,
  accountId: string,
  platform: "facebook" | "instagram",
  since?: Date
) {
  try {
    const sinceTs = since
      ? `&since=${Math.floor(since.getTime() / 1000)}`
      : "";
    if (platform === "facebook") {
      const url = `${GRAPH_API}/${accountId}/posts?fields=id,message,created_time,permalink_url,likes.summary(true),comments.summary(true),shares&limit=25${sinceTs}&access_token=${token}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return ((data.data || []) as Record<string, unknown>[]).map((p) => ({
        externalId: p.id as string,
        message: (p.message as string) || "",
        createdTime: p.created_time as string,
        permalink: p.permalink_url as string,
        likes:
          (
            p.likes as
              | { summary: { total_count: number } }
              | undefined
          )?.summary?.total_count || 0,
        comments:
          (
            p.comments as
              | { summary: { total_count: number } }
              | undefined
          )?.summary?.total_count || 0,
        shares: (p.shares as { count: number } | undefined)?.count || 0,
      }));
    } else {
      const url = `${GRAPH_API}/${accountId}/media?fields=id,caption,timestamp,permalink,like_count,comments_count&limit=25${sinceTs}&access_token=${token}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return ((data.data || []) as Record<string, unknown>[]).map((p) => ({
        externalId: p.id as string,
        message: (p.caption as string) || "",
        createdTime: p.timestamp as string,
        permalink: p.permalink as string,
        likes: (p.like_count as number) || 0,
        comments: (p.comments_count as number) || 0,
        shares: 0,
      }));
    }
  } catch {
    return [];
  }
}
