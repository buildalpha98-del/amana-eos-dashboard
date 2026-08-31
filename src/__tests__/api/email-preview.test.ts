import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

// ── Standard mock preamble ──────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

import { POST as preview } from "@/app/api/email/preview/route";
import { _clearEmailBrandingCache } from "@/lib/email-branding";

function setupActiveUserMock() {
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findUnique.mockImplementation(
    async (args: { where?: { id?: string } } | undefined) => {
      if (args?.where?.id === "user-1") {
        return { active: true, id: "user-1", role: "owner" } as never;
      }
      return null;
    },
  );
}

function postBody(body: Record<string, unknown>) {
  return createRequest("POST", "/api/email/preview", { body });
}

describe("POST /api/email/preview — branding base + layoutOptions overrides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    _clearEmailBrandingCache();
    setupActiveUserMock();
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    // Branding differs from BOTH the layout defaults and the overrides below
    // so the assertions can tell all three apart.
    prismaMock.orgSettings.findUnique.mockResolvedValue({
      name: "Bright Futures OSHC",
      primaryColor: "#112233",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await preview(postBody({ htmlContent: "<p>hi</p>" }));
    expect(res.status).toBe(401);
  });

  it("renders the branding base when layoutOptions is omitted (regression — Task 1 parity)", async () => {
    const res = await preview(
      postBody({ blocks: [{ type: "text", content: "Block body" }] }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.html).toContain("Block body");
    expect(json.html).toContain("Bright Futures OSHC");
    expect(json.html).toContain("#112233");
  });

  it("a user headerText override wins while untouched fields keep the branding base", async () => {
    const res = await preview(
      postBody({
        blocks: [{ type: "text", content: "Block body" }],
        layoutOptions: { headerText: "Winter Fair 2026" },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    // Override wins; headerColor + footerText still track branding — the
    // preview must show exactly what the send will produce.
    expect(json.html).toContain("Winter Fair 2026");
    expect(json.html).toContain("#112233");
    expect(json.html).toContain("Bright Futures OSHC");
  });

  it("a user headerColor override replaces the branding colour entirely (htmlContent mode)", async () => {
    const res = await preview(
      postBody({
        htmlContent: "<p>raw body</p>",
        layoutOptions: { headerColor: "#ABCDEF" },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.html).toContain("#ABCDEF");
    expect(json.html).not.toContain("#112233");
    expect(json.html).toContain("Bright Futures OSHC");
  });

  it("rejects an invalid headerColor with 400", async () => {
    const res = await preview(
      postBody({
        htmlContent: "<p>hi</p>",
        layoutOptions: { headerColor: "red" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects unknown layoutOptions keys with 400 (strict schema)", async () => {
    const res = await preview(
      postBody({
        htmlContent: "<p>hi</p>",
        layoutOptions: { sneaky: "nope" },
      }),
    );
    expect(res.status).toBe(400);
  });
});
