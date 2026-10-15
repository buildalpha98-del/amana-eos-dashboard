/**
 * Approving an enrolment sends the school-specific welcome email exactly
 * once — on the transition INTO processed, never on a re-save.
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
vi.mock("@/lib/run-after", () => ({ runAfter: (task: () => Promise<void>) => tasks.push(task) }));
const tasks: (() => Promise<void>)[] = [];
vi.mock("@/lib/enrolment-welcome", () => ({ sendEnrolmentWelcome: vi.fn(async () => "sent") }));
vi.mock("@/lib/parent-account", () => ({ reissueVerification: vi.fn(async () => null) }));
vi.mock("@/lib/parent-journey", () => ({ syncParentJourney: vi.fn(async () => undefined) }));
vi.mock("@/lib/enrolment-parent-contacts", () => ({ upsertContactsFromSubmission: vi.fn(async () => ({ primary: null, secondary: null })) }));
vi.mock("@/lib/notifications/parent-welcome", () => ({ sendParentWelcomeInvite: vi.fn(async () => undefined) }));
vi.mock("@/lib/room-resolver", () => ({ stampRequiredRoomIds: vi.fn(async (b: unknown) => b) }));

import { sendEnrolmentWelcome } from "@/lib/enrolment-welcome";
import { PATCH } from "@/app/api/enrolments/[id]/route";

const ctx = { params: Promise.resolve({ id: "e1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  tasks.length = 0;
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true, id: "admin-1" });
  mockSession({ id: "admin-1", name: "Admin", role: "admin" });
  prismaMock.enrolmentSubmission.update.mockResolvedValue({
    id: "e1",
    serviceId: "svc",
    primaryParent: { email: "sarah@example.test", firstName: "Sarah" },
    secondaryParent: null,
  });
  prismaMock.child.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.child.findMany.mockResolvedValue([]);
});

async function approve(previous: string) {
  prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({ serviceId: "svc", status: previous });
  const res = await PATCH(createRequest("PATCH", "/api/enrolments/e1", { body: { status: "processed" } }), ctx);
  for (const t of tasks) await t();
  return res;
}

describe("enrolment approval → welcome email", () => {
  it("sends the welcome email when an enrolment is approved", async () => {
    const res = await approve("submitted");
    expect(res.status).toBe(200);
    expect(vi.mocked(sendEnrolmentWelcome)).toHaveBeenCalledWith("e1", { verifyLink: null });
  });

  it("does not send again when an approved enrolment is saved again", async () => {
    await approve("processed");
    expect(vi.mocked(sendEnrolmentWelcome)).not.toHaveBeenCalled();
  });
});
