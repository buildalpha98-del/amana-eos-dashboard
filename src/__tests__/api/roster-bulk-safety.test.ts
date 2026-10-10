import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { POST as copyWeek } from "@/app/api/roster/copy-week/route";
import { POST as publish } from "@/app/api/roster/publish/route";
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));
vi.mock("@/lib/notify-user", () => ({ notifyUsers: vi.fn(async () => {}) }));
vi.mock("@/lib/open-shift-notify", () => ({ notifyOpenShiftsPosted: vi.fn(async () => ({ recipientCount: 0 })) }));
const shift = { id: "shift", userId: "staff", date: new Date("2026-10-05"), sessionType: "asc", shiftStart: "15:00", shiftEnd: "18:00", staffName: "Staff", role: "educator" };
const call = (action: "copy" | "publish") => action === "copy"
  ? copyWeek(createRequest("POST", "/api/roster/copy-week", { body: { serviceId: "centre", sourceWeekStart: "2026-10-05", targetWeekStart: "2026-10-12" } }))
  : publish(createRequest("POST", "/api/roster/publish", { body: { serviceId: "centre", weekStart: "2026-10-05" } }));
beforeEach(() => {
  vi.clearAllMocks(); _clearUserActiveCache();
  mockSession({ id: "admin", name: "Admin", role: "admin" });
  prismaMock.user.findUnique.mockResolvedValue({ active: true, inductionStatus: "cleared", isCentreAccount: false });
  prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
  prismaMock.rosterShift.findMany.mockResolvedValue([shift]);
  prismaMock.rosterShift.findFirst.mockResolvedValue(null);
  prismaMock.rosterShift.create.mockResolvedValue({ id: "new" });
  prismaMock.rosterShift.updateMany.mockResolvedValue({ count: 1 });
});
describe("bulk rostering uses the assignment safety gates", () => {
  it.each(["copy", "publish"] as const)("blocks %s with expired certificates before mutating shifts", async action => {
    prismaMock.complianceCertificate.findMany.mockResolvedValue([{ type: "wwcc", expiryDate: new Date("2026-10-01") }]);
    expect((await call(action)).status).toBe(400);
    expect(prismaMock.rosterShift.delete).not.toHaveBeenCalled();
    expect(prismaMock.rosterShift.create).not.toHaveBeenCalled();
    expect(prismaMock.rosterShift.updateMany).not.toHaveBeenCalled();
  });
  it.each(["copy", "publish"] as const)("blocks %s for a shared centre account before mutation", async action => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true, inductionStatus: "cleared", isCentreAccount: true });
    expect((await call(action)).status).toBe(403);
    expect(prismaMock.rosterShift.create).not.toHaveBeenCalled();
    expect(prismaMock.rosterShift.updateMany).not.toHaveBeenCalled();
  });
  it("checks certificates against the copied target date, and preserves a draft collision on failure", async () => {
    prismaMock.rosterShift.findFirst.mockResolvedValue({ id: "old-draft", status: "draft" });
    prismaMock.complianceCertificate.findMany.mockResolvedValue([{ type: "first_aid", expiryDate: new Date("2026-10-10") }]);
    expect((await call("copy")).status).toBe(400);
    expect(prismaMock.rosterShift.delete).not.toHaveBeenCalled();
  });
  it("copies a cleared educator as a draft", async () => {
    expect((await call("copy")).status).toBe(200);
    expect(prismaMock.rosterShift.create.mock.calls[0][0].data).toMatchObject({ userId: "staff", date: new Date("2026-10-12"), status: "draft" });
  });
  it("publishes only the drafts which were fetched and validated", async () => {
    expect((await call("publish")).status).toBe(200);
    expect(prismaMock.rosterShift.updateMany.mock.calls[0][0].where).toMatchObject({ id: { in: ["shift"] }, status: "draft" });
  });
  it("skips published collisions without changing them", async () => {
    prismaMock.rosterShift.findFirst.mockResolvedValue({ id: "published", status: "published" });
    const response = await call("copy");
    expect(response.status).toBe(200);
    expect((await response.json()).skipped).toHaveLength(1);
    expect(prismaMock.complianceCertificate.findMany).not.toHaveBeenCalled();
    expect(prismaMock.rosterShift.delete).not.toHaveBeenCalled();
  });
  it("allows unassigned open slots without a staff clearance check", async () => {
    prismaMock.rosterShift.findMany.mockResolvedValue([{ ...shift, userId: null }]);
    expect((await call("copy")).status).toBe(200);
    expect(prismaMock.complianceCertificate.findMany).not.toHaveBeenCalled();
  });
});
