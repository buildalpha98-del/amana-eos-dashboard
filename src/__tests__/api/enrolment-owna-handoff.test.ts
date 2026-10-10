import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { placementKey } from "@/lib/owna-handoff";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({
    limited: false,
    remaining: 59,
    resetIn: 60000,
  })),
}));
import { GET, PATCH } from "@/app/api/enrolments/[id]/owna-handoff/route";
import { GET as listEnrolments } from "@/app/api/enrolments/route";
const ctx = { params: Promise.resolve({ id: "e1" }) } as never;
const row = () => ({
  id: "e1",
  status: "processed",
  serviceId: "s1",
  childRecords: [{ id: "c1", serviceId: "s1", status: "active" }],
  ownaHandoff: null,
});
const request = (body: Record<string, unknown>) =>
  createRequest("PATCH", "/api/enrolments/e1/owna-handoff", { body });
beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  mockSession({ id: "u1", name: "Reviewer", role: "owner" });
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.enrolmentSubmission.findUnique.mockResolvedValue(row());
  prismaMock.activityLog.findMany.mockResolvedValue([]);
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  prismaMock.enrolmentOwnaHandoff.updateMany.mockResolvedValue({ count: 1 });
});
describe("staff OWNA handoff API", () => {
  it("requires a session", async () => {
    mockNoSession();
    expect(
      (await GET(createRequest("GET", "/api/enrolments/e1/owna-handoff"), ctx))
        .status,
    ).toBe(401);
  });
  it.each(["staff", "marketing"] as const)(
    "denies %s even in same centre",
    async (role) => {
      mockSession({ id: "u1", name: "User", role, serviceId: "s1" });
      expect(
        (await PATCH(request({ revision: 0, action: "claim" }), ctx)).status,
      ).toBe(403);
      expect(prismaMock.enrolmentOwnaHandoff.create).not.toHaveBeenCalled();
    },
  );
  it("denies another centre and mixed placements", async () => {
    mockSession({
      id: "u1",
      name: "Director",
      role: "member",
      serviceId: "s1",
    });
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({
      ...row(),
      childRecords: [{ id: "c", serviceId: "s2", status: "active" }],
    });
    expect(
      (await GET(createRequest("GET", "/api/enrolments/e1/owna-handoff"), ctx))
        .status,
    ).toBe(403);
  });
  it("starts unchecked and writes an atomic actor-stamped audit", async () => {
    const res = await PATCH(request({ revision: 0, action: "claim" }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).state.steps).toEqual({});
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          entityType: "EnrolmentOwnaHandoff",
        }),
      }),
    );
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });
  it("rejects stale revisions", async () => {
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({
      ...row(),
      ownaHandoff: { revision: 2, state: {} },
    });
    expect(
      (await PATCH(request({ revision: 1, action: "claim" }), ctx)).status,
    ).toBe(409);
    expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
  });
  it("rejects a concurrent update without writing an audit", async () => {
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({
      ...row(),
      ownaHandoff: {
        revision: 1,
        state: { placement: placementKey(row()), owner: null, note: "", steps: {} },
      },
    });
    prismaMock.enrolmentOwnaHandoff.updateMany.mockResolvedValue({ count: 0 });
    expect((await PATCH(request({ revision: 1, action: "claim" }), ctx)).status).toBe(409);
    expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
  });
  it.each(["P2002", "P2034"])("returns a reload conflict for %s", async (code) => {
    prismaMock.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Concurrent write", { code, clientVersion: "5.22.0" }),
    );
    expect((await PATCH(request({ revision: 0, action: "claim" }), ctx)).status).toBe(409);
  });
  it.each(["owner", "staff"] as const)("keeps raw handoff evidence out of the %s list response", async (role) => {
    mockSession({ id: "u1", name: "User", role, serviceId: "s1" });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([{
      ...row(),
      ownaHandoff: { revision: 1, state: { placement: placementKey(row()), owner: null, note: "Internal evidence", steps: {} } },
    }]);
    prismaMock.enrolmentSubmission.count.mockResolvedValue(1);
    prismaMock.enrolmentSubmission.groupBy.mockResolvedValue([]);
    const res = await listEnrolments(createRequest("GET", "/api/enrolments"));
    expect(res.status).toBe(200);
    const item = (await res.json()).submissions[0];
    expect(item).not.toHaveProperty("ownaHandoff");
    expect(item).not.toHaveProperty("childRecords");
    expect(JSON.stringify(item)).not.toContain("Internal evidence");
    if (role === "owner") expect(item.ownaHandoffSummary).toBe("OWNA: 0/4 checked");
    else expect(item).not.toHaveProperty("ownaHandoffSummary");
  });
  it("rejects malformed completion and forged actor", async () => {
    expect(
      (
        await PATCH(
          request({
            revision: 0,
            action: "complete",
            step: "children",
            by: "other",
          }),
          ctx,
        )
      ).status,
    ).toBe(400);
  });
  it.each(["submitted", "archived"])(
    "does not record checks for %s",
    async (status) => {
      prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({
        ...row(),
        status,
      });
      expect(
        (await PATCH(request({ revision: 0, action: "claim" }), ctx)).status,
      ).toBe(400);
    },
  );
  it("rejects withdrawn children", async () => {
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({
      ...row(),
      childRecords: [{ id: "c", serviceId: "s1", status: "withdrawn" }],
    });
    expect(
      (await PATCH(request({ revision: 0, action: "claim" }), ctx)).status,
    ).toBe(400);
  });
});
