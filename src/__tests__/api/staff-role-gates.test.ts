import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

import { _clearUserActiveCache } from "@/lib/server-auth";

// Programs
import {
  POST as programsPost,
  PUT as programsPut,
} from "@/app/api/services/[id]/programs/route";
import {
  PATCH as programsPatch,
  DELETE as programsDelete,
} from "@/app/api/services/[id]/programs/[activityId]/route";

// Menus
import {
  PUT as menusPut,
} from "@/app/api/services/[id]/menus/route";
import {
  POST as menuUpload,
} from "@/app/api/services/[id]/menus/upload/route";

// Already-allowed endpoints we want to regression-guard
import { POST as rollCallPost } from "@/app/api/attendance/roll-call/route";
import { PATCH as checklistPatch } from "@/app/api/services/[id]/checklists/[checklistId]/route";

async function ctx(id = "s1") {
  return { params: Promise.resolve({ id }) };
}
async function programCtx(id = "s1", activityId = "a1") {
  return { params: Promise.resolve({ id, activityId }) };
}
async function checklistCtx(id = "s1", checklistId = "cl1") {
  return { params: Promise.resolve({ id, checklistId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("Programs write endpoints — staff is blocked, coordinator is allowed", () => {
  it("staff cannot POST a new program activity (403)", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    const res = await programsPost(
      createRequest("POST", "/api/services/s1/programs", {
        body: {
          weekStart: "2026-05-04",
          day: "monday",
          startTime: "15:30",
          endTime: "16:30",
          title: "Free play",
        },
      }),
      await ctx(),
    );
    expect(res.status).toBe(403);
  });

  it("member cannot POST a new program activity (403)", async () => {
    mockSession({ id: "u1", name: "M", role: "member", serviceId: "s1" });
    const res = await programsPost(
      createRequest("POST", "/api/services/s1/programs", {
        body: {
          weekStart: "2026-05-04",
          day: "monday",
          startTime: "15:30",
          endTime: "16:30",
          title: "Free play",
        },
      }),
      await ctx(),
    );
    expect(res.status).toBe(403);
  });

  it("coordinator CAN POST a new program activity", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "coordinator",
      serviceId: "s1",
    });
    prismaMock.programActivity.create.mockResolvedValue({
      id: "a1",
      title: "Free play",
      createdBy: { id: "u1", name: "C" },
    });
    prismaMock.activityLog.create.mockResolvedValue({});
    const res = await programsPost(
      createRequest("POST", "/api/services/s1/programs", {
        body: {
          weekStart: "2026-05-04",
          day: "monday",
          startTime: "15:30",
          endTime: "16:30",
          title: "Free play",
        },
      }),
      await ctx(),
    );
    expect(res.status).toBe(201);
  });

  it("staff cannot PUT bulk program activities (403)", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    const res = await programsPut(
      createRequest("PUT", "/api/services/s1/programs", {
        body: { weekStart: "2026-05-04", activities: [] },
      }),
      await ctx(),
    );
    expect(res.status).toBe(403);
  });

  it("staff cannot PATCH a program activity (403)", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    const res = await programsPatch(
      createRequest("PATCH", "/api/services/s1/programs/a1", {
        body: { title: "Updated" },
      }),
      await programCtx(),
    );
    expect(res.status).toBe(403);
  });

  it("staff cannot DELETE a program activity (403)", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    const res = await programsDelete(
      createRequest("DELETE", "/api/services/s1/programs/a1"),
      await programCtx(),
    );
    expect(res.status).toBe(403);
  });
});

describe("Menu write endpoints — staff is blocked, coordinator is allowed", () => {
  it("staff cannot PUT the weekly menu (403)", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    const res = await menusPut(
      createRequest("PUT", "/api/services/s1/menus", {
        body: {
          weekStart: "2026-05-04",
          items: [],
        },
      }),
      await ctx(),
    );
    expect(res.status).toBe(403);
  });

  it("coordinator is NOT blocked by the role gate on PUT menu", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "coordinator",
      serviceId: "s1",
    });
    const res = await menusPut(
      createRequest("PUT", "/api/services/s1/menus", {
        body: { weekStart: "2026-05-04", items: [] },
      }),
      await ctx(),
    );
    // Coordinator may still hit validation or transaction errors, but the role
    // gate must not turn it into a 403. This is the narrow assertion we care
    // about — the rest is covered by the menu-write integration tests.
    expect(res.status).not.toBe(403);
  });

  it("staff cannot POST /menus/upload (403)", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    const res = await menuUpload(
      createRequest("POST", "/api/services/s1/menus/upload"),
      await ctx(),
    );
    expect(res.status).toBe(403);
  });
});

describe("Regression — endpoints staff MUST keep access to", () => {
  it("staff CAN POST /api/attendance/roll-call (no role gate)", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    // The route validates input + service access further down, but the role
    // gate shouldn't fire. We just need to get past the withApiAuth roles check.
    const res = await rollCallPost(
      createRequest("POST", "/api/attendance/roll-call", {
        body: {},
      }),
    );
    // NOT 403 — whatever else this returns (400 for validation or 404, etc.),
    // a staff role must not be forbidden from this surface.
    expect(res.status).not.toBe(403);
  });

  it("staff CAN PATCH a checklist item (mark as done)", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    prismaMock.dailyChecklist.findFirst.mockResolvedValue({
      id: "cl1",
      serviceId: "s1",
      items: [{ id: "i1", checked: false }],
    });
    const res = await checklistPatch(
      createRequest("PATCH", "/api/services/s1/checklists/cl1", {
        body: { itemId: "i1", checked: true },
      }),
      await checklistCtx(),
    );
    expect(res.status).not.toBe(403);
  });
});
