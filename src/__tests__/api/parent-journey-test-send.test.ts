import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 3, resetIn: 60000 })) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: ["x"], suppressed: [] })) }));
vi.mock("@/lib/parent-journey-preview", () => ({
  renderJourneyEmail: vi.fn(async () => ({
    subject: "You're booked in!",
    html: "<p>hi</p>",
    attachments: [{ filename: "pack.pdf", path: "https://amanaoshc.com.au/pack.pdf" }],
  })),
}));
import { sendEmail } from "@/lib/email";
import { POST } from "@/app/api/parent-journey/test/route";

const send = (body: Record<string, unknown>) =>
  POST(createRequest("POST", "/api/parent-journey/test", { body }), {} as never);

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  mockSession({ id: "u1", name: "Jayden", role: "owner" });
  prismaMock.user.findUnique.mockResolvedValue({ active: true, email: "jayden@amanaoshc.com.au" });
});

describe("parent journey test send", () => {
  it("goes to me by default, with the attachment and [Test] subject", async () => {
    const res = await send({ ids: ["first_day_confirmed"], serviceId: "s1" });
    expect((await res.json()).sentTo).toBe("jayden@amanaoshc.com.au");
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({
      to: "jayden@amanaoshc.com.au",
      subject: "[Test] You're booked in!",
      attachments: [{ filename: "pack.pdf" }],
    });
  });

  it("can go to the enrolments inbox — and nowhere else", async () => {
    const res = await send({ ids: ["first_day_confirmed"], serviceId: "s1", to: "enrolments" });
    expect((await res.json()).sentTo).toBe("enrolment@amanaoshc.com.au");
    expect((await send({ ids: ["first_day_confirmed"], serviceId: "s1", to: "family@example.com" })).status).toBe(400);
  });
});
