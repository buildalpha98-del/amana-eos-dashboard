/**
 * Quiz-gate enforcement on the module-progress paths + course GET hardening.
 *
 * Quiz modules may only be completed by PASSING the quiz (server-side scored
 * attempt) — the manual progress endpoints must refuse them; otherwise the
 * induction gate ("no roster/clock-in until essential training done") is
 * bypassable with one click. Also: non-admins can't touch other users'
 * progress, and non-admins can't read draft courses or other learners'
 * enrollments.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { mockSession } from "../../helpers/auth-mock";
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
vi.mock("@/lib/induction", () => ({
  onModuleProgressed: vi.fn(() => Promise.resolve("cleared")),
}));

import { POST as ENROLLMENTS_POST } from "@/app/api/lms/enrollments/route";
import { POST as PROGRESS_POST } from "@/app/api/lms/module-progress/route";
import { GET as COURSE_GET } from "@/app/api/lms/courses/[id]/route";

const QUIZ_MODULE = { id: "mq", type: "quiz", courseId: "c1" };
const DOC_MODULE = { id: "md", type: "document", courseId: "c1" };
const OTHER_COURSE_MODULE = { id: "mx", type: "document", courseId: "OTHER" };

function baseMocks() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation(() => Promise.resolve({ active: true }));
  prismaMock.lMSModule.findUnique.mockImplementation((args: unknown) => {
    const { where } = args as { where: { id: string } };
    const mod = [QUIZ_MODULE, DOC_MODULE, OTHER_COURSE_MODULE].find((m) => m.id === where.id);
    return Promise.resolve(mod ?? null);
  });
  // Ownership lookup (no include) vs recalc lookup (include) on the same model.
  prismaMock.lMSEnrollment.findUnique.mockImplementation((args: unknown) => {
    const { include } = args as { include?: unknown };
    if (include) {
      return Promise.resolve({
        id: "e1", userId: "u1", startedAt: null,
        course: { modules: [{ id: "mq" }, { id: "md" }] },
        moduleProgress: [{ moduleId: "md", completed: true }],
      });
    }
    return Promise.resolve({ id: "e1", userId: "u1", courseId: "c1", startedAt: null });
  });
  prismaMock.lMSQuizAttempt.findFirst.mockResolvedValue(null); // no passed attempt by default
  prismaMock.lMSModuleProgress.upsert.mockResolvedValue({ id: "p1", completed: true });
  prismaMock.lMSEnrollment.update.mockResolvedValue({ id: "e1" });
}
beforeEach(baseMocks);

/* ── POST /api/lms/enrollments (Mode B: progress) ── */
describe("enrollments progress mode — quiz gate", () => {
  const body = { enrollmentId: "e1", moduleId: "mq", completed: true };

  it("403 when completing a quiz module without a passed attempt", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff" });
    const res = await ENROLLMENTS_POST(createRequest("POST", "/api/lms/enrollments", { body }));
    expect(res.status).toBe(403);
    expect(prismaMock.lMSModuleProgress.upsert).not.toHaveBeenCalled();
  });

  it("200 when completing a quiz module WITH a passed attempt", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff" });
    prismaMock.lMSQuizAttempt.findFirst.mockResolvedValue({ id: "a1" });
    const res = await ENROLLMENTS_POST(createRequest("POST", "/api/lms/enrollments", { body }));
    expect(res.status).toBe(200);
  });

  it("un-marking a quiz module needs no attempt", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff" });
    const res = await ENROLLMENTS_POST(
      createRequest("POST", "/api/lms/enrollments", { body: { ...body, completed: false } }),
    );
    expect(res.status).toBe(200);
  });

  it("document modules complete without an attempt", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff" });
    const res = await ENROLLMENTS_POST(
      createRequest("POST", "/api/lms/enrollments", { body: { ...body, moduleId: "md" } }),
    );
    expect(res.status).toBe(200);
  });

  it("404 when the module belongs to a different course", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff" });
    const res = await ENROLLMENTS_POST(
      createRequest("POST", "/api/lms/enrollments", { body: { ...body, moduleId: "mx" } }),
    );
    expect(res.status).toBe(404);
  });

  it("403 when a NON-ADMIN role (member) updates someone else's enrollment", async () => {
    mockSession({ id: "someone-else", name: "Member", role: "member" });
    const res = await ENROLLMENTS_POST(
      createRequest("POST", "/api/lms/enrollments", { body: { ...body, moduleId: "md" } }),
    );
    expect(res.status).toBe(403);
  });

  it("admins may override — complete another user's quiz module without an attempt", async () => {
    mockSession({ id: "boss", name: "Owner", role: "owner" });
    const res = await ENROLLMENTS_POST(createRequest("POST", "/api/lms/enrollments", { body }));
    expect(res.status).toBe(200);
  });
});

/* ── POST /api/lms/module-progress (player path) ── */
describe("module-progress — quiz gate", () => {
  const body = { enrollmentId: "e1", moduleId: "mq", completed: true };

  it("403 when completing a quiz module without a passed attempt", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff" });
    const res = await PROGRESS_POST(createRequest("POST", "/api/lms/module-progress", { body }));
    expect(res.status).toBe(403);
    expect(prismaMock.lMSModuleProgress.upsert).not.toHaveBeenCalled();
  });

  it("200 when completing a quiz module WITH a passed attempt", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff" });
    prismaMock.lMSQuizAttempt.findFirst.mockResolvedValue({ id: "a1" });
    const res = await PROGRESS_POST(createRequest("POST", "/api/lms/module-progress", { body }));
    expect(res.status).toBe(200);
  });

  it("404 when the module belongs to a different course", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff" });
    const res = await PROGRESS_POST(
      createRequest("POST", "/api/lms/module-progress", { body: { ...body, moduleId: "mx" } }),
    );
    expect(res.status).toBe(404);
  });

  it("document modules complete without an attempt", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff" });
    const res = await PROGRESS_POST(
      createRequest("POST", "/api/lms/module-progress", { body: { ...body, moduleId: "md" } }),
    );
    expect(res.status).toBe(200);
  });
});

/* ── GET /api/lms/courses/[id] hardening ── */
describe("course GET — draft + enrollment visibility", () => {
  const paramsOf = (id: string) => ({ params: Promise.resolve({ id }) });
  const COURSE = {
    id: "c1", deleted: false, status: "published",
    enrollments: [
      { id: "e1", userId: "u1", user: { id: "u1" }, moduleProgress: [] },
      { id: "e2", userId: "u2", user: { id: "u2" }, moduleProgress: [] },
    ],
    modules: [],
    service: null,
  };

  it("404 for a non-admin fetching a draft course", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff" });
    prismaMock.lMSCourse.findUnique.mockResolvedValue({ ...COURSE, status: "draft" });
    const res = await COURSE_GET(createRequest("GET", "/api/lms/courses/c1"), paramsOf("c1"));
    expect(res.status).toBe(404);
  });

  it("admins can fetch a draft course", async () => {
    mockSession({ id: "boss", name: "Admin", role: "admin" });
    prismaMock.lMSCourse.findUnique.mockResolvedValue({ ...COURSE, status: "draft" });
    const res = await COURSE_GET(createRequest("GET", "/api/lms/courses/c1"), paramsOf("c1"));
    expect(res.status).toBe(200);
  });

  it("non-admin roles (member) only see their own enrollment", async () => {
    mockSession({ id: "u1", name: "Member", role: "member" });
    prismaMock.lMSCourse.findUnique.mockResolvedValue({
      ...COURSE,
      enrollments: [...COURSE.enrollments],
    });
    const res = await COURSE_GET(createRequest("GET", "/api/lms/courses/c1"), paramsOf("c1"));
    expect(res.status).toBe(200);
    const bodyJson = await res.json();
    expect(bodyJson.enrollments).toHaveLength(1);
    expect(bodyJson.enrollments[0].userId).toBe("u1");
  });

  it("admins see all enrollments", async () => {
    mockSession({ id: "boss", name: "HO", role: "head_office" });
    prismaMock.lMSCourse.findUnique.mockResolvedValue({
      ...COURSE,
      enrollments: [...COURSE.enrollments],
    });
    const res = await COURSE_GET(createRequest("GET", "/api/lms/courses/c1"), paramsOf("c1"));
    const bodyJson = await res.json();
    expect(bodyJson.enrollments).toHaveLength(2);
  });
});
