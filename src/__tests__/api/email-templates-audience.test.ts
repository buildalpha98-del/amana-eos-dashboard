/**
 * The shared email template library: staff and parent composers each see
 * their own templates plus "both"; templates in use by a sequence can't be
 * deleted out from under it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 59, resetIn: 60_000 })),
}));

import { GET, POST } from "@/app/api/email-templates/route";
import { DELETE } from "@/app/api/email-templates/[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true, id: "admin-1" });
  mockSession({ id: "admin-1", name: "Admin", role: "admin" });
  prismaMock.emailTemplate.findMany.mockResolvedValue([]);
});

describe("email template library", () => {
  it("?audience=staff returns staff and both", async () => {
    await GET(createRequest("GET", "/api/email-templates?audience=staff"));
    expect(prismaMock.emailTemplate.findMany.mock.calls[0][0].where).toEqual({ audience: { in: ["staff", "both"] } });
  });

  it("?audience=parents returns parents and both", async () => {
    await GET(createRequest("GET", "/api/email-templates?audience=parents"));
    expect(prismaMock.emailTemplate.findMany.mock.calls[0][0].where).toEqual({ audience: { in: ["parents", "both"] } });
  });

  it("saves the audience, and refuses unsafe links", async () => {
    prismaMock.emailTemplate.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "t1", ...data }));
    const ok = await POST(
      createRequest("POST", "/api/email-templates", {
        body: { name: "Wellbeing", subject: "Hi", audience: "staff", blocks: [{ type: "button", label: "Go", url: "/policies" }] },
      }),
    );
    expect(ok.status).toBe(201);
    expect(prismaMock.emailTemplate.create.mock.calls[0][0].data.audience).toBe("staff");
    const bad = await POST(
      createRequest("POST", "/api/email-templates", {
        body: { name: "Bad", subject: "Hi", blocks: [{ type: "image", url: "javascript:alert(1)" }] },
      }),
    );
    expect(bad.status).toBe(400);
  });

  it("educators can't create templates", async () => {
    mockSession({ id: "s1", name: "Staff", role: "staff" });
    const res = await POST(createRequest("POST", "/api/email-templates", { body: { name: "x", subject: "y" } }));
    expect(res.status).toBe(403);
  });

  it("won't delete a template an automated sequence still uses", async () => {
    prismaMock.emailTemplate.findUnique.mockResolvedValue({ id: "t1" });
    prismaMock.sequenceStep.count.mockResolvedValue(2);
    const res = await DELETE(createRequest("DELETE", "/api/email-templates/t1"), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(409);
    expect(prismaMock.emailTemplate.delete).not.toHaveBeenCalled();
  });
});
