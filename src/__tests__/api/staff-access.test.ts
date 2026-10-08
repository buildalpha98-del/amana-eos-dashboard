/**
 * Per-person access (2026-10-08): ticks, positions, ratio exclusion — who
 * may set them, and that the ticks change what the server does.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { canPublishPosts } from "@/lib/app-settings";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

import { GET, PATCH } from "@/app/api/users/[id]/access/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const educator = { id: "edu", role: "staff", serviceId: "svc-1", permissions: [], positions: [], excludeFromRatio: false };

function target(t: Record<string, unknown>) {
  prismaMock.user.findUnique.mockImplementation((args: { where: { id: string }; select?: Record<string, unknown> }) =>
    Promise.resolve(args.select && "active" in args.select && Object.keys(args.select).length <= 2 ? { active: true } : t),
  );
}

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.activityLog.create.mockResolvedValue({});
  prismaMock.user.update.mockImplementation((a: { data: Record<string, unknown> }) =>
    Promise.resolve({ permissions: [], positions: [], excludeFromRatio: false, ...a.data }),
  );
});

describe("who may set access", () => {
  it("a Director may set an educator's at their own centre", async () => {
    mockSession({ id: "dir", name: "D", role: "member", serviceId: "svc-1" });
    target(educator);
    const res = await PATCH(createRequest("PATCH", "/x", { body: { permissions: ["posts.publish"], positions: ["responsible_person"] } }), ctx("edu"));
    expect(res.status).toBe(200);
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
  });

  it("a Director may not tick their own", async () => {
    mockSession({ id: "dir", name: "D", role: "member", serviceId: "svc-1" });
    target({ ...educator, id: "dir", role: "member" });
    const res = await PATCH(createRequest("PATCH", "/x", { body: { permissions: ["posts.publish"] } }), ctx("dir"));
    expect(res.status).toBe(403);
  });

  it("a Director may not set another centre's educator, or another Director", async () => {
    mockSession({ id: "dir", name: "D", role: "member", serviceId: "svc-2" });
    target(educator);
    expect((await PATCH(createRequest("PATCH", "/x", { body: { positions: [] } }), ctx("edu"))).status).toBe(403);
    mockSession({ id: "dir", name: "D", role: "member", serviceId: "svc-1" });
    target({ ...educator, id: "dir2", role: "member" });
    expect((await PATCH(createRequest("PATCH", "/x", { body: { positions: [] } }), ctx("dir2"))).status).toBe(403);
  });

  it("an educator can read but not change their own", async () => {
    mockSession({ id: "edu", name: "E", role: "staff", serviceId: "svc-1" });
    target(educator);
    const get = await GET(createRequest("GET", "/x"), ctx("edu"));
    expect(get.status).toBe(200);
    expect((await get.json()).canEdit).toBe(false);
    expect((await PATCH(createRequest("PATCH", "/x", { body: { permissions: ["posts.publish"] } }), ctx("edu"))).status).toBe(403);
  });

  it("refuses unknown keys rather than storing them", async () => {
    mockSession({ id: "own", name: "O", role: "owner" });
    target(educator);
    const res = await PATCH(createRequest("PATCH", "/x", { body: { permissions: ["billing.everything"] } }), ctx("edu"));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe("the posts.publish tick", () => {
  it("lets an educator publish", () => {
    expect(canPublishPosts("staff", false, ["posts.publish"])).toBe(true);
  });
  it("lets a Director publish while 'only admins publish' is on", () => {
    expect(canPublishPosts("member", true, ["posts.publish"])).toBe(true);
    expect(canPublishPosts("member", true, [])).toBe(false);
  });
});
