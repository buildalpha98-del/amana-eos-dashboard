/**
 * LMS course PATCH — the publish/unpublish path used by the admin
 * "Publish" button in LmsCoursesTab.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../../helpers/auth-mock";
import { createRequest } from "../../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

import { PATCH } from "@/app/api/lms/courses/[id]/route";

const paramsOf = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation(() => Promise.resolve({ active: true }));
});

describe("PATCH /api/lms/courses/[id] — publish", () => {
  const publishBody = { status: "published" };

  it("401 when unauthenticated", async () => {
    mockNoSession();
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", { body: publishBody }),
      paramsOf("c1"),
    );
    expect(res.status).toBe(401);
  });

  it("403 for a non-admin role (staff)", async () => {
    mockSession({ id: "s1", name: "Staff", role: "staff" });
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", { body: publishBody }),
      paramsOf("c1"),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid status value", async () => {
    mockSession({ id: "a1", name: "Admin", role: "admin" });
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", { body: { status: "live" } }),
      paramsOf("c1"),
    );
    expect(res.status).toBe(400);
  });

  it("publishes a draft course (admin)", async () => {
    mockSession({ id: "a1", name: "Admin", role: "admin" });
    prismaMock.lMSCourse.update.mockImplementation((args: unknown) => {
      const { where, data } = args as { where: { id: string }; data: Record<string, unknown> };
      return Promise.resolve({
        id: where.id,
        title: "The Amana Way",
        track: "essential",
        ...data,
      });
    });
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", { body: publishBody }),
      paramsOf("c1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("published");
    expect(prismaMock.lMSCourse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: { status: "published" },
      }),
    );
  });

  it("unpublishes back to draft (head_office)", async () => {
    mockSession({ id: "h1", name: "HO", role: "head_office" });
    prismaMock.lMSCourse.update.mockImplementation((args: unknown) => {
      const { where, data } = args as { where: { id: string }; data: Record<string, unknown> };
      return Promise.resolve({ id: where.id, title: "C2", ...data });
    });
    const res = await PATCH(
      createRequest("PATCH", "/api/lms/courses/c1", { body: { status: "draft" } }),
      paramsOf("c1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("draft");
  });
});
