/**
 * Settings → OWNA (21 Oct 2026): OWNA's centre list with suggested links,
 * and one OWNA centre can't be linked to two of ours.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 59, resetIn: 60000 })) }));
const getCentres = vi.fn();
vi.mock("@/lib/owna", () => ({ getOwnaClient: () => ({ getCentres }) }));

import { GET } from "@/app/api/owna/centres/route";
import { PUT } from "@/app/api/owna/mapping/route";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.service.findMany.mockResolvedValue([
    { id: "s-ga", name: "Amana OSHC MFIS Greenacre" },
    { id: "s-hp", name: "Amana OSHC MFIS Hoxton Park" },
    { id: "s-ug", name: "Amana OSHC Unity Grammar" },
  ]);
});

describe("GET /api/owna/centres", () => {
  it("lists OWNA's centres and suggests the clear matches", async () => {
    mockSession({ id: "o", name: "Owner", role: "owner" });
    getCentres.mockResolvedValue([
      { id: 101, name: "Amana OSHC Greenacre", alias: "", suburb: "Greenacre", state: "NSW", children: 80 },
      { id: 102, name: "Amana OSHC Hoxton Park", alias: "", suburb: "Hoxton Park", state: "NSW", children: 60 },
      { id: 103, name: "Some Other Centre", alias: "", suburb: "Nowhere", state: "VIC", children: 10 },
    ]);
    const body = await (await GET(createRequest("GET", "/api/owna/centres"))).json();
    expect(body.centres).toHaveLength(3);
    expect(body.suggestions).toEqual({ "s-ga": "101", "s-hp": "102" });
  });
  it("says so when OWNA doesn't answer", async () => {
    mockSession({ id: "o", name: "Owner", role: "owner" });
    getCentres.mockRejectedValue(new Error("OWNA 401"));
    const body = await (await GET(createRequest("GET", "/api/owna/centres"))).json();
    expect(body).toMatchObject({ configured: true, error: "OWNA 401", centres: [] });
  });
  it("owner and admin only", async () => {
    mockSession({ id: "m", name: "Dir", role: "member", serviceId: "s-ga" });
    expect((await GET(createRequest("GET", "/api/owna/centres"))).status).toBe(403);
  });
});

describe("PUT /api/owna/mapping", () => {
  it("refuses to link one OWNA centre to two of ours", async () => {
    mockSession({ id: "o", name: "Owner", role: "owner" });
    prismaMock.service.findFirst.mockResolvedValue({ name: "Amana OSHC MFIS Greenacre" });
    const res = await PUT(createRequest("PUT", "/api/owna/mapping", { body: { serviceId: "s-hp", ownaServiceId: "101" } }));
    expect(res.status).toBe(409);
    expect(prismaMock.service.update).not.toHaveBeenCalled();
  });
  it("saves a free link", async () => {
    mockSession({ id: "o", name: "Owner", role: "owner" });
    prismaMock.service.findFirst.mockResolvedValue(null);
    prismaMock.service.update.mockResolvedValue({ id: "s-hp", ownaServiceId: "102" });
    expect((await PUT(createRequest("PUT", "/api/owna/mapping", { body: { serviceId: "s-hp", ownaServiceId: "102" } }))).status).toBe(200);
  });
});
