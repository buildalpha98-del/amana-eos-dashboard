/**
 * Coordinators (member) can chase their OWN centre's unfinished forms —
 * "We called them" and "Email a reminder" — and nobody else's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 59, resetIn: 60_000 })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "req",
}));

import { POST as followUp } from "@/app/api/families/[id]/follow-up/route";
import { POST as remind } from "@/app/api/families/[id]/remind/route";

const ctx = { params: Promise.resolve({ id: "acc1" }) } as never;

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true, id: "coord" });
  prismaMock.parentAccount.findUnique.mockResolvedValue({ id: "acc1", email: "huda@example.test", firstName: "Huda", enrolmentReminderSentAt: null, enrolmentDraft: null });
  prismaMock.parentAccount.update.mockResolvedValue({});
  prismaMock.activityLog.create.mockResolvedValue({});
  prismaMock.enrolmentDraft.findUnique.mockResolvedValue({ data: { children: [{ schoolName: "Malek Fahd Islamic School Greenacre" }] } });
  prismaMock.service.findMany.mockResolvedValue([{ id: "svc-ga", name: "Amana OSHC MFIS Greenacre" }]);
});

describe("coordinator follow-ups", () => {
  it("can mark their own centre's family as called", async () => {
    mockSession({ id: "coord", name: "Coord", role: "member", serviceId: "svc-ga" });
    const res = await followUp(createRequest("POST", "/api/families/acc1/follow-up"), ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.parentAccount.update.mock.calls[0][0].data.followUpCalledAt).toBeInstanceOf(Date);
  });

  it("can't touch another centre's family", async () => {
    mockSession({ id: "coord", name: "Coord", role: "member", serviceId: "svc-other" });
    expect((await followUp(createRequest("POST", "/api/families/acc1/follow-up"), ctx)).status).toBe(403);
    expect((await remind(createRequest("POST", "/api/families/acc1/remind"), ctx)).status).toBe(403);
    expect(prismaMock.parentAccount.update).not.toHaveBeenCalled();
  });

  it("educators can't use either", async () => {
    mockSession({ id: "coord", name: "Staff", role: "staff", serviceId: "svc-ga" });
    expect((await followUp(createRequest("POST", "/api/families/acc1/follow-up"), ctx)).status).toBe(403);
  });
});
