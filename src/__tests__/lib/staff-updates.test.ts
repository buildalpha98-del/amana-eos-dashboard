/**
 * Staff emails (src/lib/staff-updates.ts + the Cowork route).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: ["x"], suppressed: [] })) }));
vi.mock("@/lib/notify-user", () => ({ notifyUsers: vi.fn(async () => 1) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "req",
}));
vi.mock("@/app/api/_lib/auth", () => ({
  authenticateCowork: vi.fn(async () => null),
  setVersionHeaders: (r: Response) => r,
}));
const settings = vi.hoisted(() => ({ auto: false }));
vi.mock("@/lib/org-settings", () => ({
  getOrgSettings: vi.fn(async () => ({ notifications: { coworkStaffEmailsAutoApprove: settings.auto } })),
}));

import { sendEmail } from "@/lib/email";
import { inAudience, roundupHtml, sendUrgentUpdate, sendWeeklyRoundup, type StaffRecipient } from "@/lib/staff-updates";
import { POST as coworkPOST } from "@/app/api/cowork/staff-updates/route";

const person = (over: Partial<StaffRecipient> = {}): StaffRecipient => ({
  id: "u1", email: "a@x.test", name: "Aisha Khan", role: "staff", serviceIds: ["svc-gr"], ...over,
});
const update = (over: Record<string, unknown> = {}) => ({
  id: "su1", type: "reminder", title: "Sign the roster", body: "Please sign.", linkUrl: null, linkLabel: null,
  audienceRoles: [], audienceServiceIds: [], urgent: false, status: "approved", source: "admin", sentAt: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  settings.auto = false;
  prismaMock.user.findMany.mockResolvedValue([
    { id: "u1", email: "a@x.test", name: "Aisha Khan", role: "staff", serviceId: "svc-gr", serviceMemberships: [] },
    { id: "u2", email: "b@x.test", name: "Bilal", role: "member", serviceId: "svc-bh", serviceMemberships: [{ serviceId: "svc-gr" }] },
    { id: "u3", email: "c@x.test", name: "Carla", role: "admin", serviceId: null, serviceMemberships: [] },
  ]);
});

describe("who gets a staff email", () => {
  it("empty audience means everyone", () => {
    expect(inAudience(person(), { audienceRoles: [], audienceServiceIds: [] })).toBe(true);
  });
  it("filters by role and by centre (including extra centres someone works at)", () => {
    expect(inAudience(person(), { audienceRoles: ["member"], audienceServiceIds: [] })).toBe(false);
    expect(inAudience(person({ serviceIds: ["svc-bh", "svc-gr"] }), { audienceRoles: [], audienceServiceIds: ["svc-gr"] })).toBe(true);
    expect(inAudience(person(), { audienceRoles: [], audienceServiceIds: ["svc-bh"] })).toBe(false);
  });
  it("never includes shared centre mailboxes (the recipient query excludes them)", async () => {
    prismaMock.staffUpdate.findMany.mockResolvedValue([update()]);
    prismaMock.staffUpdate.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.staffUpdate.update.mockResolvedValue({});
    await sendWeeklyRoundup(new Date("2026-10-11T20:00:00Z"));
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toMatchObject({ active: true, isCentreAccount: false });
  });
});

describe("the email itself", () => {
  it("escapes what people type", () => {
    const html = roundupHtml({ name: "<b>Aisha</b>" }, [update({ title: "<script>x</script>", body: "Use <b>care</b>" }) as never], new Date("2026-10-12T00:00:00Z"));
    expect(html).not.toContain("<script>x</script>");
    expect(html).not.toContain("<b>Aisha</b>");
    expect(html).toContain("week of 12 October");
  });
});

describe("sending", () => {
  it("the Monday round-up sends one email per person with only their updates", async () => {
    prismaMock.staffUpdate.findMany.mockResolvedValue([
      update({ id: "a", audienceServiceIds: ["svc-gr"] }),
      update({ id: "b", audienceRoles: ["admin"] }),
    ]);
    prismaMock.staffUpdate.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.staffUpdate.update.mockResolvedValue({});
    const r = await sendWeeklyRoundup(new Date("2026-10-11T20:00:00Z"));
    // u1 (Greenacre) gets a; u2 (works at Greenacre too) gets a; u3 (admin) gets b.
    expect(r).toMatchObject({ updates: 2, people: 3, sent: 3 });
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(3);
  });

  it("an urgent email that someone else already claimed is not sent again", async () => {
    prismaMock.staffUpdate.updateMany.mockResolvedValue({ count: 0 });
    expect(await sendUrgentUpdate("su1")).toEqual({ recipients: 0, sent: 0 });
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });
});

describe("Cowork", () => {
  const body = { type: "wellbeing", title: "Five-minute reset", body: "Try this breathing exercise." };
  it("lands as a draft for an admin to approve", async () => {
    prismaMock.staffUpdate.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new", ...data }));
    const res = await coworkPOST(createRequest("POST", "/api/cowork/staff-updates", { body }));
    expect(res.status).toBe(201);
    const data = prismaMock.staffUpdate.create.mock.calls[0][0].data;
    expect(data.source).toBe("cowork");
    expect(data.status).toBeUndefined(); // default: draft
    expect((await res.json()).needsApproval).toBe(true);
  });
  it("is approved straight away when the admin has switched approval off", async () => {
    settings.auto = true;
    prismaMock.staffUpdate.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new", ...data }));
    await coworkPOST(createRequest("POST", "/api/cowork/staff-updates", { body }));
    expect(prismaMock.staffUpdate.create.mock.calls[0][0].data.status).toBe("approved");
  });
  it("refuses an unknown centre code", async () => {
    prismaMock.service.findMany.mockResolvedValue([]);
    const res = await coworkPOST(createRequest("POST", "/api/cowork/staff-updates", { body: { ...body, serviceCodes: ["NOPE"] } }));
    expect(res.status).toBe(404);
  });
});
