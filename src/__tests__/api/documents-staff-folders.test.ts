import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "rid",
}));

import { GET as listFolders } from "@/app/api/documents/staff-folders/route";
import { GET as getFolder } from "@/app/api/documents/staff-folders/[userId]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const d = new Date("2026-10-01T00:00:00Z");

describe("staff folders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true, id: "u-safina", name: "Safina", avatar: null, service: { name: "Arkana" } } as never);
  });

  it.each(["staff", "member", "marketing"])("403s for %s", async (role) => {
    mockSession({ id: "x", name: "X", role: role as never });
    expect((await listFolders(createRequest("GET", "/api/documents/staff-folders"))).status).toBe(403);
  });

  it("builds one folder per person from documents, certificates and contracts", async () => {
    mockSession({ id: "a", name: "Admin", role: "admin" });
    prismaMock.document.groupBy.mockResolvedValue([{ assignedToId: "u-safina", _count: { _all: 2 }, _max: { createdAt: d } }] as never);
    prismaMock.complianceCertificate.groupBy.mockResolvedValue([{ userId: "u-safina", _count: { _all: 3 }, _max: { createdAt: d } }] as never);
    prismaMock.employmentContract.groupBy.mockResolvedValue([{ userId: "u-safina", _count: { _all: 1 }, _max: { createdAt: d } }] as never);
    prismaMock.user.findMany.mockResolvedValue([{ id: "u-safina", name: "Safina", avatar: null, active: true, service: { name: "Arkana" } }] as never);

    const body = await (await listFolders(createRequest("GET", "/api/documents/staff-folders"))).json();
    expect(body.folders).toEqual([
      expect.objectContaining({ userId: "u-safina", documents: 2, certificates: 3, contracts: 1, total: 6, serviceName: "Arkana" }),
    ]);
  });

  it("a folder links every file through its authorised proxy, never a raw blob URL", async () => {
    mockSession({ id: "a", name: "Admin", role: "admin" });
    prismaMock.document.findMany.mockResolvedValue([{ id: "doc1", title: "Offer letter", fileName: "o.pdf", category: "hr", createdAt: d }] as never);
    prismaMock.complianceCertificate.findMany.mockResolvedValue([{ id: "c1", type: "wwcc", label: null, fileName: "w.jpg", expiryDate: d, createdAt: d }] as never);
    prismaMock.employmentContract.findMany.mockResolvedValue([{ id: "k1", contractType: "casual", status: "active", startDate: d, createdAt: d }] as never);

    const res = await getFolder(createRequest("GET", "/api/documents/staff-folders/u-safina"), { params: Promise.resolve({ userId: "u-safina" }) } as never);
    const body = await res.json();
    expect(body.items.map((i: { href: string }) => i.href)).toEqual([
      "/api/contracts/k1/document",
      "/api/compliance/c1/download",
      "/api/staff-documents/doc1",
    ]);
    expect(JSON.stringify(body)).not.toContain("blob.vercel");
  });
});
