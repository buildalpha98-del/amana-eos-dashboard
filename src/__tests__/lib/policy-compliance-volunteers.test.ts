/**
 * No policy reminder emails to volunteers (Daniel, 21 Oct 2026) — they
 * still count in the compliance figures.
 */
import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

const sendEmail = vi.fn(async () => ({ sent: ["x"], suppressed: [] }));
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...(a as [])) }));
vi.mock("@/lib/email-branding", () => ({
  getEmailBranding: vi.fn(async () => ({ orgName: "Amana OSHC", logoUrl: null, primaryColor: "#004E64", accentColor: "#FECE00" })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "req",
}));

import { checkPolicyCompliance } from "@/lib/policy-compliance";

describe("policy reminders", () => {
  it("emails the educator, not the volunteer", async () => {
    prismaMock.policyDocument.findMany.mockResolvedValue([
      { id: "p1", title: "Child Safe Policy", currentVersion: { id: "v1", versionNumber: 2 } },
    ]);
    prismaMock.user.findMany.mockImplementation(async (args: { where?: { role?: unknown } }) =>
      args.where?.role
        ? [{ name: "Daniel", email: "owner@x.test", role: "owner" }]
        : [
            { id: "s1", name: "Sarah Khan", email: "sarah@x.test", role: "staff" },
            { id: "vol1", name: "Vol Unteer", email: "vol@x.test", role: "volunteer" },
          ],
    );
    prismaMock.policyDocumentAcknowledgement.findMany.mockResolvedValue([]);

    const res = await checkPolicyCompliance();
    const to = sendEmail.mock.calls.map((c) => (c as unknown as [{ to: string }])[0].to);
    expect(to).toContain("sarah@x.test");
    expect(to).not.toContain("vol@x.test");
    expect(res.usersWithPending).toBe(2); // the volunteer still counts
  });
});
