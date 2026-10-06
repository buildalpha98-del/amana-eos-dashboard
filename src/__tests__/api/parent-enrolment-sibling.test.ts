/**
 * Siblings enrol through the SAME live form as a first child: the draft is
 * re-opened with the family's details and everything per-child cleared.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";
import { ApiError } from "@/lib/api-error";

let parent: { email: string; enrolmentIds: string[]; accountId?: string } = {
  email: "p@x.test",
  enrolmentIds: ["enr-1"],
  accountId: "acc-1",
};

vi.mock("@/lib/parent-auth", () => ({
  withParentAuth:
    (handler: (req: unknown, ctx: unknown) => Promise<Response>) =>
    async (req: unknown) => {
      try {
        return await handler(req, { parent });
      } catch (err) {
        if (err instanceof ApiError) {
          return new Response(JSON.stringify({ error: err.message }), { status: err.status });
        }
        throw err;
      }
    },
}));

import { POST } from "@/app/api/parent/enrolment-draft/sibling/route";

const call = () => POST(createRequest("POST", "/api/parent/enrolment-draft/sibling") as never, {} as never);
const written = () =>
  (prismaMock.enrolmentDraft.upsert.mock.calls[0][0] as {
    update: { data: Record<string, unknown>; currentStep: number; submittedAt: null };
    create: { data: Record<string, unknown> };
  });

describe("POST /api/parent/enrolment-draft/sibling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parent = { email: "p@x.test", enrolmentIds: ["enr-1"], accountId: "acc-1" };
    prismaMock.enrolmentDraft.upsert.mockResolvedValue({} as never);
  });

  it("re-opens a submitted draft with the family carried over and the child cleared", async () => {
    prismaMock.enrolmentDraft.findUnique.mockResolvedValue({
      submittedAt: new Date(),
      data: {
        me: { firstName: "Aisha", isLegalCarer: true, crn: "123" },
        contacts: { courtOrders: false, secondaryParent: { firstName: "Omar" } },
        children: [{ firstName: "Yusuf" }],
        billing: { startDate: "2026-09-01", sessions: { amanaAfternoons: ["Monday"] } },
        agreement: { termsAccepted: true, signature: "Aisha" },
      },
    } as never);

    const res = await call();
    expect(res.status).toBe(200);
    const { update } = written();
    expect(update.submittedAt).toBeNull();
    expect(update.currentStep).toBe(1);
    expect(update.data).toMatchObject({
      sibling: true,
      me: { firstName: "Aisha", crn: "123", isLegalCarer: false },
      contacts: { secondaryParent: { firstName: "Omar" } },
      children: [{}],
      billing: {},
      agreement: {},
    });
  });

  it("never wipes a draft that's still in progress", async () => {
    prismaMock.enrolmentDraft.findUnique.mockResolvedValue({
      submittedAt: null,
      data: { children: [{ firstName: "Half-typed" }] },
    } as never);
    const res = await call();
    expect(res.status).toBe(200);
    expect(prismaMock.enrolmentDraft.upsert).not.toHaveBeenCalled();
  });

  it("prefills a family who enrolled before the portal form from their submission", async () => {
    prismaMock.enrolmentDraft.findUnique.mockResolvedValue(null);
    prismaMock.enrolmentSubmission.findFirst.mockResolvedValue({
      primaryParent: { firstName: "Mariam", surname: "Ali", mobile: "0400", crn: "9" },
      secondaryParent: { firstName: "Bilal", livesWithPrimary: true },
      emergencyContacts: [{ name: "Aunty Sara", relationship: "Auntie", phone: "0411" }],
    } as never);
    await call();
    expect(written().create.data).toMatchObject({
      me: { firstName: "Mariam", surname: "Ali", crn: "9", isLegalCarer: false },
      contacts: {
        secondaryParent: { firstName: "Bilal", sameAddressAsPrimary: true },
        emergency: [{ name: "Aunty Sara", phone: "0411" }],
      },
    });
  });

  it("needs an account-backed session", async () => {
    parent = { email: "p@x.test", enrolmentIds: ["enr-1"] };
    const res = await call();
    expect(res.status).toBe(403);
  });
});
