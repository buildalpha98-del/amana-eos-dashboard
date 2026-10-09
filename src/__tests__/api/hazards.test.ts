/**
 * Hazard & maintenance log (2026-10-09, OWNA parity): anyone at the centre
 * reports; the Coordinator triages and closes; high priority tells them.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 9, resetIn: 0 })) }));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "t",
}));
const notify = vi.hoisted(() => ({ notifyUsers: vi.fn(() => Promise.resolve(1)) }));
vi.mock("@/lib/notify-user", () => notify);

import { GET, POST } from "@/app/api/services/[id]/hazards/route";
import { PATCH } from "@/app/api/services/[id]/hazards/[hazardId]/route";

const ctx = (id: string, hazardId?: string) => ({ params: Promise.resolve({ id, ...(hazardId ? { hazardId } : {}) }) });
const BLOB = "https://abcd.public.blob.vercel-storage.com/uploads/gate.jpg";

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.user.findMany.mockResolvedValue([{ id: "coord" }]);
  prismaMock.service.findUnique.mockResolvedValue({ managerId: null });
  prismaMock.hazardReport.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "hz1", ...data }));
  prismaMock.hazardReport.findMany.mockResolvedValue([]);
});

describe("reporting", () => {
  beforeEach(() => mockSession({ id: "ed", name: "Sarah Awad", role: "staff", serviceId: "svc-a" }));

  it("any educator at the centre can report, with a photo", async () => {
    const res = await POST(createRequest("POST", "/x", { body: { title: "Back gate latch", location: "Playground", photoUrl: BLOB } }), ctx("svc-a"));
    expect(res.status).toBe(201);
    expect(prismaMock.hazardReport.create.mock.calls[0][0].data).toMatchObject({ reportedById: "ed", reportedByName: "Sarah Awad", priority: "medium" });
  });

  it("tells the Coordinator straight away when it's high priority", async () => {
    await POST(createRequest("POST", "/x", { body: { title: "Broken glass in sandpit", priority: "high" } }), ctx("svc-a"));
    await new Promise((r) => setTimeout(r, 0));
    expect(notify.notifyUsers).toHaveBeenCalledWith(expect.anything(), ["coord"], expect.objectContaining({ title: expect.stringMatching(/High-priority hazard/) }));
  });

  it("refuses photos from outside our storage, and other centres", async () => {
    expect((await POST(createRequest("POST", "/x", { body: { title: "Gate", photoUrl: "https://evil.example.com/x.jpg" } }), ctx("svc-a"))).status).toBe(400);
    expect((await POST(createRequest("POST", "/x", { body: { title: "Gate" } }), ctx("svc-b"))).status).toBe(403);
  });

  it("educators can read the log but not triage it", async () => {
    expect((await GET(createRequest("GET", "/x"), ctx("svc-a"))).status).toBe(200);
    expect((await PATCH(createRequest("PATCH", "/x", { body: { status: "fixed" } }), ctx("svc-a", "hz1"))).status).toBe(403);
  });
});

describe("the Coordinator", () => {
  beforeEach(() => mockSession({ id: "coord", name: "Greenacre", role: "member", serviceId: "svc-a" }));

  it("closes a hazard off and records who did", async () => {
    prismaMock.hazardReport.findUnique.mockResolvedValue({ serviceId: "svc-a", status: "in_progress" });
    prismaMock.hazardReport.update.mockResolvedValue({ id: "hz1" });
    await PATCH(createRequest("PATCH", "/x", { body: { status: "fixed", fixNotes: "Latch replaced" } }), ctx("svc-a", "hz1"));
    expect(prismaMock.hazardReport.update.mock.calls[0][0].data).toMatchObject({
      status: "fixed",
      fixNotes: "Latch replaced",
      fixedByName: "Greenacre",
      fixedAt: expect.any(Date),
    });
  });

  it("can't touch another centre's hazard", async () => {
    prismaMock.hazardReport.findUnique.mockResolvedValue({ serviceId: "svc-b", status: "open" });
    expect((await PATCH(createRequest("PATCH", "/x", { body: { status: "fixed" } }), ctx("svc-a", "hz1"))).status).toBe(404);
  });
});
