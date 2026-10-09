import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { documentVisibilityWhere } from "@/lib/document-visibility";
import { NO_SERVICE_MATCH } from "@/lib/authz-scope";
import { GET as medicalExport } from "@/app/api/reports/medical-alerts/export/route";
import { GET as download } from "@/app/api/documents/download/route";
import { POST as verifyMfa } from "@/app/api/auth/mfa/verify/route";
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));

const viewer = { id: "member", name: "Director", role: "member" as const, serviceId: "centre-a" };
beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  mockSession(viewer);
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.child.findMany.mockResolvedValue([]);
  prismaMock.document.findFirst.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllGlobals());

describe("medical export scope", () => {
  it.each([["", "centre-a"], ["?serviceId=centre-a", "centre-a"], ["?serviceId=centre-b", NO_SERVICE_MATCH]])("pins or denies a centre member's export: %s", async (query, expected) => {
    expect((await medicalExport(createRequest("GET", `/api/reports/medical-alerts/export${query}`))).status).toBe(200);
    expect(prismaMock.child.findMany.mock.calls[0][0].where.serviceId).toBe(expected);
  });
  it("fails closed for a member without a centre", async () => {
    mockSession({ ...viewer, serviceId: null });
    await medicalExport(createRequest("GET", "/api/reports/medical-alerts/export"));
    expect(prismaMock.child.findMany.mock.calls[0][0].where.serviceId).toBe(NO_SERVICE_MATCH);
  });
  it("preserves owner access across centres", async () => {
    mockSession({ ...viewer, role: "owner" });
    await medicalExport(createRequest("GET", "/api/reports/medical-alerts/export"));
    expect(prismaMock.child.findMany.mock.calls[0][0].where.serviceId).toBeUndefined();
  });
});

describe("authorised document delivery", () => {
  const blob = "https://example.public.blob.vercel-storage.com/file.pdf";
  it("refuses an arbitrary Blob URL without fetching it", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await download(createRequest("GET", `/api/documents/download?file=${encodeURIComponent(blob)}`))).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("applies the library visibility policy when resolving an ID", async () => {
    expect((await download(createRequest("GET", "/api/documents/download?id=private"))).status).toBe(404);
    expect(prismaMock.document.findFirst.mock.calls[0][0].where).toEqual({ deleted: false, AND: [{ id: "private" }, documentVisibilityWhere(viewer)] });
  });
  it.each(["text/html; charset=utf-8", "image/svg+xml", "application/xhtml+xml"])("downloads active content as inert bytes: %s", async (mime) => {
    prismaMock.document.findFirst.mockResolvedValue({ fileUrl: blob, fileName: "file.html" });
    const fetch = vi.fn(async () => new Response("<script>attack()</script>", { headers: { "content-type": mime } }));
    vi.stubGlobal("fetch", fetch);
    const res = await download(createRequest("GET", "/api/documents/download?id=visible"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(fetch).toHaveBeenCalledWith(blob, { redirect: "error" });
  });
  it("keeps PDFs inline and honours explicit downloads", async () => {
    prismaMock.document.findFirst.mockResolvedValue({ fileUrl: blob, fileName: "file.pdf" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("PDF", { headers: { "content-type": "application/pdf" } })));
    const inline = await download(createRequest("GET", "/api/documents/download?id=visible"));
    expect(inline.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(inline.headers.get("content-security-policy") ?? "").not.toContain("sandbox");
    const attachment = await download(createRequest("GET", "/api/documents/download?id=visible&download=1"));
    expect(attachment.headers.get("content-disposition")).toMatch(/^attachment;/);
  });
  it("resolves legacy filenames through visible document records", async () => {
    await download(createRequest("GET", "/api/documents/download?file=legacy.pdf"));
    expect(prismaMock.document.findFirst.mock.calls[0][0].where.AND[0]).toEqual({ fileUrl: "/uploads/legacy.pdf" });
  });
});

describe("MFA verification endpoint", () => {
  it("rejects unauthenticated requests", async () => {
    mockNoSession();
    expect((await verifyMfa(createRequest("POST", "/api/auth/mfa/verify", { body: { userId: "other", code: "123456" } }))).status).toBe(401);
  });
  it("does not verify or consume another account's codes", async () => {
    expect((await verifyMfa(createRequest("POST", "/api/auth/mfa/verify", { body: { userId: "other", code: "123456" } }))).status).toBe(403);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });
});
