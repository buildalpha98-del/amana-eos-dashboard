import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    withRequestId: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
  generateRequestId: () => "rid",
}));

const checkRateLimitMock = vi.fn(async () => ({ limited: false, remaining: 9, resetIn: 0 }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => checkRateLimitMock(),
}));

vi.mock("@/lib/parent-auth", () => ({ signParentJwt: vi.fn(async () => "jwt-token") }));

import { GET } from "@/app/api/parent/auth/verify/route";

describe("GET /api/parent/auth/verify — rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ limited: false, remaining: 9, resetIn: 0 });
  });

  it("redirects to the login error and skips the DB lookup when rate limited", async () => {
    checkRateLimitMock.mockResolvedValue({ limited: true, remaining: 0, resetIn: 60_000 });

    const res = await GET(
      createRequest("GET", "/api/parent/auth/verify?token=abc", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/parent/login");
    expect(prismaMock.parentMagicLink.findUnique).not.toHaveBeenCalled();
  });

  it("proceeds to verify the token when under the limit", async () => {
    prismaMock.parentMagicLink.findUnique.mockResolvedValue(null); // invalid token → normal error redirect

    const res = await GET(
      createRequest("GET", "/api/parent/auth/verify?token=abc", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      }),
    );

    expect(checkRateLimitMock).toHaveBeenCalled();
    expect(prismaMock.parentMagicLink.findUnique).toHaveBeenCalled();
    expect(res.status).toBe(307);
  });
});
