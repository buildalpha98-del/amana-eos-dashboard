/**
 * Card-expiry reminders (Daniel, 2026-10-21): the owner and admins are told,
 * the family is NOT emailed — someone calls them and asks for bank details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { createRequest } from "../../helpers/request";

vi.mock("@/lib/cron-guard", () => ({
  verifyCronSecret: () => null,
  acquireCronLock: async () => ({ acquired: true, complete: async () => {}, fail: async () => {} }),
}));
const notifyUsers = vi.hoisted(() => vi.fn(async () => 2));
vi.mock("@/lib/notify-user", () => ({ notifyUsers }));
const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendEmail }));

import { GET } from "@/app/api/cron/card-expiry-reminders/route";

const run = () => GET(createRequest("GET", "/api/cron/card-expiry-reminders"), undefined as never);
// A card valid through the end of next month, seen ~30 days out.
const now = new Date();
const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
const expiring = { expiryMonth: String(next.getUTCMonth() + 1).padStart(2, "0"), expiryYear: String(next.getUTCFullYear()) };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findMany.mockResolvedValue([{ id: "owner-1" }, { id: "admin-1" }]);
});

describe("card expiry", () => {
  it("notifies owner and admins, never emails the family, and records it", async () => {
    // Expired one, so a reminder is due regardless of today's date.
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { id: "enr-1", primaryParent: { firstName: "Synthetic", surname: "Family", email: "family@example.test" }, paymentDetails: { lastFour: "1111", cardType: "Visa", expiryMonth: "01", expiryYear: "2024" } },
    ]);
    const res = await run();
    expect((await res.json()).notified).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toMatchObject({ active: true, isCentreAccount: false, role: { in: ["owner", "admin"] } });
    expect(notifyUsers).toHaveBeenCalledWith(expect.anything(), ["owner-1", "admin-1"], expect.objectContaining({
      type: "card_expiry",
      title: "Synthetic Family: Visa ending 1111 has expired",
      body: expect.stringMatching(/bank details/),
      link: "/enrolments?id=enr-1",
    }));
    expect(prismaMock.enrolmentSubmission.update.mock.calls[0][0].data.paymentDetails.expiryRemindersSent).toEqual({ "01/2024": ["expired"] });
  });

  it("doesn't repeat a notification already sent for this expiry", async () => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { id: "enr-1", primaryParent: {}, paymentDetails: { expiryMonth: "01", expiryYear: "2024", expiryRemindersSent: { "01/2024": ["expired"] } } },
    ]);
    expect((await (await run()).json()).notified).toBe(0);
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("doesn't mark anything as done when nobody could be told", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { id: "enr-1", primaryParent: {}, paymentDetails: { ...expiring, expiryMonth: "01", expiryYear: "2024" } },
    ]);
    await run();
    expect(prismaMock.enrolmentSubmission.update).not.toHaveBeenCalled();
  });
});
