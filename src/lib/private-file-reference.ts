/** Client-safe validation for application file links; never accepts other origins. */
export function privateFileId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const configured = typeof window === "undefined" ? process.env.NEXTAUTH_URL : window.location.origin;
    if (!configured || parsed.origin !== new URL(configured).origin || parsed.search || parsed.hash || parsed.username || parsed.password) return null;
    return /^\/api\/private-files\/([a-zA-Z0-9_-]+)$/.exec(parsed.pathname)?.[1] ?? null;
  } catch { return null; }
}
