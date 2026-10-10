import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET as connect } from "@/app/api/xero/connect/route";
import { GET as callback } from "@/app/api/xero/callback/route";
import { exchangeCodeForTokens } from "@/lib/xero";
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));
vi.mock("@/lib/xero", () => ({
  getXeroAuthUrl: (state: string) => `https://login.xero.com/identity/connect/authorize?state=${state}`,
  exchangeCodeForTokens: vi.fn(async () => ({ access_token: "access", refresh_token: "refresh", expires_in: 3600, scope: "scope" })),
  fetchXeroConnections: vi.fn(async () => [{ tenantId: "tenant", tenantName: "Test organisation" }]),
  encryptToken: (value: string) => `encrypted:${value}`,
}));
beforeEach(() => {
  vi.clearAllMocks(); _clearUserActiveCache();
  mockSession({ id: "owner", name: "Owner", role: "owner" });
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});
const finish = (state?: string, cookie?: string) => callback(createRequest("GET", `/api/xero/callback?code=code${state ? `&state=${state}` : ""}`, { headers: cookie ? { cookie: `xero_oauth_state=${cookie}` } : {} }));
describe("Xero OAuth owner and browser binding", () => {
  it("creates a short-lived HttpOnly nonce and binds it to the current owner", async () => {
    const response = await connect(createRequest("GET", "/api/xero/connect"));
    const { url } = await response.json();
    const state = new URL(url).searchParams.get("state");
    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(response.cookies.get("xero_oauth_state")?.value).toBe(`owner:${state}`);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=600");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });
  it.each([[undefined, undefined], ["nonce", undefined], ["nonce", "owner:other"], ["nonce", "other:nonce"], ["nonce", "owner:%F0%9F%98%80%F0%9F%98%80%F0%9F%98%80"]])("rejects missing or mismatched state %s / %s", async (state, cookie) => {
    expect((await finish(state, cookie)).status).toBe(400);
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
    expect(prismaMock.xeroConnection.upsert).not.toHaveBeenCalled();
  });
  it("denies non-owners even when they have a matching state", async () => {
    mockSession({ id: "owner", name: "Member", role: "member" });
    expect((await finish("nonce", "owner:nonce")).status).toBe(403);
    expect(prismaMock.xeroConnection.upsert).not.toHaveBeenCalled();
  });
  it("exchanges an owner's valid callback and consumes the state cookie", async () => {
    const response = await finish("nonce", "owner:nonce");
    expect(response.status).toBe(307);
    expect(prismaMock.xeroConnection.upsert).toHaveBeenCalledTimes(1);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("clears the state on exchange failure without changing the tenant", async () => {
    vi.mocked(exchangeCodeForTokens).mockRejectedValueOnce(new Error("provider failure"));
    const response = await finish("nonce", "owner:nonce");
    expect(response.status).toBe(500);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(prismaMock.xeroConnection.upsert).not.toHaveBeenCalled();
  });
});
