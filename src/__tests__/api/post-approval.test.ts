/**
 * Post approval (2026-10-08): educators write, the Director releases.
 * Before this, educators couldn't post at all (POST 403'd under a
 * "Create Post" button), a draft could be published by re-saving it, a
 * Director could switch off "only admins publish" for themselves, and a
 * draft with tagged children notified those families straight away.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));
const notifyPublished = vi.fn(() => Promise.resolve());
const notifyTagged = vi.fn(() => Promise.resolve());
vi.mock("@/lib/notifications/posts", () => ({ notifyPostPublished: (...a: unknown[]) => notifyPublished(...(a as [])) }));
vi.mock("@/lib/parent-notifications", () => ({ notifyParentNewPost: (...a: unknown[]) => notifyTagged(...(a as [])) }));

import { GET, POST } from "@/app/api/services/[id]/parent-posts/route";
import { PATCH, DELETE } from "@/app/api/services/[id]/parent-posts/[postId]/route";
import { PATCH as patchSettings } from "@/app/api/services/[id]/app-settings/route";

const svc = { params: Promise.resolve({ id: "svc-1" }) };
const postCtx = { params: Promise.resolve({ id: "svc-1", postId: "p1" }) };
const educator = { id: "edu", name: "Educator", role: "staff" as const, serviceId: "svc-1" };
const director = { id: "dir", name: "Director", role: "member" as const, serviceId: "svc-1" };

function settings(appSettings: unknown = {}) {
  prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1", appSettings });
}

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.child.findMany.mockResolvedValue([{ id: "c1" }]);
  prismaMock.activityLog.create.mockResolvedValue({});
  prismaMock.parentPost.create.mockImplementation((args: { data: { status: string } }) =>
    Promise.resolve({ id: "p1", ...args.data, tags: [] }),
  );
});

describe("creating", () => {
  const body = { title: "Painting", content: "We painted", type: "observation", childIds: ["c1"], status: "published" };

  it("an educator's post lands as a draft and tells nobody", async () => {
    mockSession(educator);
    settings();
    const res = await POST(createRequest("POST", "/api/services/svc-1/parent-posts", { body }), svc);
    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe("draft");
    expect(notifyTagged).not.toHaveBeenCalled();
    expect(notifyPublished).not.toHaveBeenCalled();
  });

  it("a Director's post publishes and notifies", async () => {
    mockSession(director);
    settings();
    const res = await POST(createRequest("POST", "/api/services/svc-1/parent-posts", { body }), svc);
    expect((await res.json()).status).toBe("published");
    expect(notifyTagged).toHaveBeenCalled();
  });

  it("the list tells the screen who may publish", async () => {
    prismaMock.parentPost.findMany.mockResolvedValue([]);
    settings();
    mockSession(educator);
    expect((await (await GET(createRequest("GET", "/api/services/svc-1/parent-posts"), svc)).json()).canPublish).toBe(false);
    mockSession(director);
    expect((await (await GET(createRequest("GET", "/api/services/svc-1/parent-posts"), svc)).json()).canPublish).toBe(true);
  });
});

describe("editing and releasing", () => {
  const updated = (status: string) => ({ id: "p1", title: "Painting", type: "observation", status, tags: [{ child: { id: "c1" } }] });

  it("re-saving a draft as 'published' keeps it a draft for an educator", async () => {
    mockSession(educator);
    settings();
    prismaMock.parentPost.findUnique.mockResolvedValue({ id: "p1", serviceId: "svc-1", authorId: "edu", status: "draft" });
    prismaMock.parentPost.update.mockImplementation((args: { data: { status?: string } }) =>
      Promise.resolve(updated(args.data.status ?? "draft")),
    );
    await PATCH(createRequest("PATCH", "/x", { body: { status: "published" } }), postCtx);
    expect(prismaMock.parentPost.update.mock.calls[0][0].data.status).toBe("draft");
    expect(notifyPublished).not.toHaveBeenCalled();
  });

  it("an educator can't change a post that's already out", async () => {
    mockSession(educator);
    settings();
    prismaMock.parentPost.findUnique.mockResolvedValue({ id: "p1", serviceId: "svc-1", authorId: "edu", status: "published" });
    const res = await PATCH(createRequest("PATCH", "/x", { body: { title: "New" } }), postCtx);
    expect(res.status).toBe(403);
  });

  it("an educator can't touch someone else's draft", async () => {
    mockSession(educator);
    settings();
    prismaMock.parentPost.findUnique.mockResolvedValue({ id: "p1", serviceId: "svc-1", authorId: "other", status: "draft", title: "x" });
    expect((await PATCH(createRequest("PATCH", "/x", { body: { title: "New" } }), postCtx)).status).toBe(403);
    expect((await DELETE(createRequest("DELETE", "/x"), postCtx)).status).toBe(403);
  });

  it("the Director releases an educator's draft — and the tagged families hear then", async () => {
    mockSession(director);
    settings();
    prismaMock.parentPost.findUnique.mockResolvedValue({ id: "p1", serviceId: "svc-1", authorId: "edu", status: "draft" });
    prismaMock.parentPost.update.mockResolvedValue(updated("published"));
    const res = await PATCH(createRequest("PATCH", "/x", { body: { status: "published" } }), postCtx);
    expect(res.status).toBe(200);
    expect(notifyPublished).toHaveBeenCalledWith("p1");
    expect(notifyTagged).toHaveBeenCalled();
  });

  it("with 'only admins publish' on, the Director's release stays a draft", async () => {
    mockSession(director);
    settings({ posts: { onlyApproversPublish: true } });
    prismaMock.parentPost.findUnique.mockResolvedValue({ id: "p1", serviceId: "svc-1", authorId: "dir", status: "draft" });
    prismaMock.parentPost.update.mockResolvedValue(updated("draft"));
    await PATCH(createRequest("PATCH", "/x", { body: { status: "published" } }), postCtx);
    expect(prismaMock.parentPost.update.mock.calls[0][0].data.status).toBe("draft");
  });
});

describe("settings", () => {
  it("a Director can't switch off 'only admins publish' for themselves", async () => {
    mockSession(director);
    settings({ posts: { onlyApproversPublish: true } });
    const res = await patchSettings(
      createRequest("PATCH", "/x", { body: { posts: { onlyApproversPublish: false } } }),
      svc,
    );
    expect(res.status).toBe(403);
  });
});
