/**
 * Ticking "invitation" / "sessions" on the OWNA checklist emails the family
 * after the save — unless staff untick "Email the family".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { placementKey } from "@/lib/owna-handoff";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 59, resetIn: 60000 })) }));
const tasks: (() => Promise<void>)[] = [];
vi.mock("@/lib/run-after", () => ({ runAfter: (t: () => Promise<void>) => tasks.push(t) }));
vi.mock("@/lib/owna-handover", () => ({ onHandoffStepCompleted: vi.fn(async () => undefined) }));

import { onHandoffStepCompleted } from "@/lib/owna-handover";
import { PATCH } from "@/app/api/enrolments/[id]/owna-handoff/route";

const ctx = { params: Promise.resolve({ id: "e1" }) } as never;
const enrolment = { id: "e1", status: "processed", serviceId: "s1", childRecords: [{ id: "c1", serviceId: "s1", status: "active" }] };
const owned = (steps: Record<string, unknown> = {}) => ({
  enrolmentId: "e1",
  revision: 2,
  state: { placement: placementKey(enrolment), owner: { id: "u1", name: "Reviewer" }, note: "", steps },
});
const child = { at: "2026-10-15T00:00:00.000Z", by: { id: "u1", name: "Reviewer" }, evidence: "entered" };

beforeEach(() => {
  vi.clearAllMocks();
  tasks.length = 0;
  _clearUserActiveCache();
  mockSession({ id: "u1", name: "Reviewer", role: "owner" });
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.activityLog.findMany.mockResolvedValue([]);
  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
  prismaMock.enrolmentOwnaHandoff.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({ ...enrolment, ownaHandoff: owned({ children: child }) });
});

const patch = (body: Record<string, unknown>) =>
  PATCH(createRequest("PATCH", "/api/enrolments/e1/owna-handoff", { body: { revision: 2, ...body } }), ctx);

describe("OWNA checklist → family email", () => {
  it("invitation sent: emails the family after the save", async () => {
    const res = await patch({ action: "complete", step: "invitation", mode: "sent", evidence: "Sent from OWNA" });
    expect(res.status).toBe(200);
    for (const t of tasks) await t();
    expect(vi.mocked(onHandoffStepCompleted)).toHaveBeenCalledWith("e1", "invitation", expect.objectContaining({ mode: "sent" }));
  });

  it("sessions: carries the first day", async () => {
    await patch({ action: "complete", step: "sessions", evidence: "Booked", firstDay: "2026-10-21" });
    for (const t of tasks) await t();
    expect(vi.mocked(onHandoffStepCompleted)).toHaveBeenCalledWith("e1", "sessions", expect.objectContaining({ firstDay: "2026-10-21" }));
  });

  it("\"Email the family\" unticked: nothing is sent", async () => {
    await patch({ action: "complete", step: "invitation", mode: "sent", evidence: "Sent", notifyFamily: false });
    for (const t of tasks) await t();
    expect(vi.mocked(onHandoffStepCompleted)).not.toHaveBeenCalled();
  });

  it("notes and other steps don't email", async () => {
    await patch({ action: "note", evidence: "Call Friday" });
    for (const t of tasks) await t();
    expect(vi.mocked(onHandoffStepCompleted)).not.toHaveBeenCalled();
  });
});
