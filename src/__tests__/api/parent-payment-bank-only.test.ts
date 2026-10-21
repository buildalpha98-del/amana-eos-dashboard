/**
 * Parent self-service payment (dormant behind the parent-app gate, kept
 * safe): bank only — security brief 2026-10-21, batch 2 (S04).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

// Same error → response contract as the real wrapper.
vi.mock("@/lib/parent-auth", () => ({
  withParentAuth: (handler: (req: unknown, ctx: unknown) => Promise<Response>) => async (req: unknown) => {
    try {
      return await handler(req, { parent: { email: "family@example.test", enrolmentIds: ["enr-1"], accountId: "acct-1" } });
    } catch (err) {
      const e = err as { status?: number; message: string };
      return Response.json({ error: e.message }, { status: e.status ?? 500 });
    }
  },
}));
const enc = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@/lib/field-encryption", () => ({ encryptField: vi.fn((p: string) => (enc.calls.push(p), "v1:c")) }));

import { PUT } from "@/app/api/parent/payment/route";

const put = (body: Record<string, unknown>) => PUT(createRequest("PUT", "/api/parent/payment", { body }), undefined as never) as Promise<Response>;

beforeEach(() => {
  vi.clearAllMocks();
  enc.calls = [];
  prismaMock.enrolmentSubmission.findFirst.mockResolvedValue({ id: "enr-1" });
});

describe("parent payment PUT", () => {
  it.each([
    { method: "credit_card", cardName: "A", cardNumber: "4111111111111111", ccv: "123" },
    { method: "bank_account", accountName: "A", bsb: "062000", accountNumber: "12345678", ccv: "123" },
  ])("refuses card data: %o", async (body) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect(enc.calls).toHaveLength(0);
    expect(prismaMock.enrolmentSubmission.update).not.toHaveBeenCalled();
  });

  it("saves bank details for the family's own enrolment only", async () => {
    const res = await put({ method: "bank_account", accountName: "A Family", bsb: "062000", accountNumber: "12345678" });
    expect(res.status).toBe(200);
    expect(prismaMock.enrolmentSubmission.update.mock.calls[0][0]).toMatchObject({
      where: { id: "enr-1" },
      data: { paymentMethod: "bank_account", paymentDetails: { bsbLastThree: "000", accountLastFour: "5678", raw: "v1:c" } },
    });
    expect(Object.keys(JSON.parse(enc.calls[0])).sort()).toEqual(["accountName", "accountNumber", "bsb", "method"]);
  });
});
