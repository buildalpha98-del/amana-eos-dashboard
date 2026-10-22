import { beforeEach, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { applyCardCleanup } from "@/lib/payment-card-cleanup";
const plan = { id: "synthetic", paymentMethod: "credit_card", original: { raw: "synthetic-encrypted-card" }, cleaned: { lastFour: "1111" }, cardKeyNames: ["raw.cardNumber"] };
beforeEach(() => vi.clearAllMocks());
it("skips a bank edit committed after inventory without an audit claiming deletion", async () => {
  prismaMock.enrolmentSubmission.updateMany.mockResolvedValue({ count: 0 });
  expect(await applyCardCleanup(prismaMock, "owner", plan)).toBe(false);
  expect(prismaMock.enrolmentSubmission.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: plan.id, paymentMethod: plan.paymentMethod, paymentDetails: { equals: plan.original } } }));
  expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
});
it("audits a successful compare-and-set in the same transaction", async () => {
  prismaMock.enrolmentSubmission.updateMany.mockResolvedValue({ count: 1 });
  expect(await applyCardCleanup(prismaMock, "owner", plan)).toBe(true);
  expect(prismaMock.$transaction).toHaveBeenCalled();
  expect(prismaMock.activityLog.create).toHaveBeenCalled();
});
it("does not touch bank records", async () => {
  expect(await applyCardCleanup(prismaMock, "owner", { ...plan, paymentMethod: "bank_account" })).toBe(false);
  expect(prismaMock.$transaction).not.toHaveBeenCalled();
});
