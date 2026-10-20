/**
 * POST /api/enrolments/[id]/first-day (21 Oct 2026) — and the new day-1 email.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 59, resetIn: 60000 })) }));
vi.mock("@/lib/first-day-check", () => ({ recordFirstDay: vi.fn(async () => undefined) }));
vi.mock("@/lib/email-template-overrides", () => ({
  applyEmailTemplateOverride: async (o: { defaultSubject: string; defaultBody: string; vars: Record<string, string>; wrap: (b: string) => string }) => {
    const fill = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in o.vars ? o.vars[k] : m));
    return { subject: fill(o.defaultSubject), html: o.wrap(fill(o.defaultBody)) };
  },
}));

import { POST } from "@/app/api/enrolments/[id]/first-day/route";
import { recordFirstDay } from "@/lib/first-day-check";
import { nurtureDay1CheckinEmail } from "@/lib/email-templates/nurture";

const ctx = { params: Promise.resolve({ id: "e1" }) } as never;
const post = (action: string) => POST(createRequest("POST", "/api/enrolments/e1/first-day", { body: { action } }), ctx);

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({ id: "e1", serviceId: "svc-1", status: "processed" });
  prismaMock.activityLog.create.mockResolvedValue({});
});

describe("first-day buttons", () => {
  it("head office records attended", async () => {
    mockSession({ id: "ho", name: "HO", role: "head_office" });
    expect((await post("attended")).status).toBe(200);
    expect(vi.mocked(recordFirstDay)).toHaveBeenCalledWith("e1", "attended", "ho");
  });
  it("a coordinator only for their own centre", async () => {
    mockSession({ id: "d1", name: "Dir", role: "member", serviceId: "svc-1" });
    expect((await post("called")).status).toBe(200);
    mockSession({ id: "d2", name: "Dir", role: "member", serviceId: "svc-2" });
    expect((await post("called")).status).toBe(403);
  });
  it("educators can't, and only for confirmed enrolments", async () => {
    mockSession({ id: "s1", name: "Ed", role: "staff", serviceId: "svc-1" });
    expect((await post("attended")).status).toBe(403);
    mockSession({ id: "ho", name: "HO", role: "head_office" });
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({ id: "e1", serviceId: "svc-1", status: "submitted" });
    expect((await post("attended")).status).toBe(400);
  });
});

describe("the day-after email", () => {
  it("names the child", async () => {
    const m = await nurtureDay1CheckinEmail("Sarah", "Amana OSHC MFIS Greenacre", undefined, "https://x.test/f", "Yusuf Khan");
    expect(m.subject).toBe("How did Yusuf's first session go, Sarah?");
    expect(m.html).toContain("We noticed Yusuf just had their first session");
    expect(m.html).toContain("Did Yusuf love it?");
    expect(m.html).toContain("Inshallah");
  });
  it("falls back to 'your child'", async () => {
    const m = await nurtureDay1CheckinEmail("Sarah", "Amana OSHC MFIS Greenacre");
    expect(m.subject).toBe("How did your child's first session go, Sarah?");
  });
});
