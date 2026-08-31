import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { createRequest } from "../../helpers/request";

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

const acquireCronLock = vi.fn();
vi.mock("@/lib/cron-guard", () => ({
  acquireCronLock: (name: string, period: string) =>
    acquireCronLock(name, period),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

import { GET } from "@/app/api/cron/l10-prep-digest/route";

const ORIGINAL_ENV = { ...process.env };

describe("/api/cron/l10-prep-digest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    acquireCronLock.mockResolvedValue({ acquired: true });
    prismaMock.user.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("401s without the cron secret", async () => {
    const res = await GET(createRequest("GET", "/api/cron/l10-prep-digest"));
    expect(res.status).toBe(401);
  });

  it("includes head_office, eos and eos_implementer recipients", async () => {
    // Regression: the recipient filter predated half the Role enum —
    // head_office / eos / eos_implementer users never got the digest.
    const res = await GET(
      createRequest("GET", "/api/cron/l10-prep-digest", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);

    const arg = prismaMock.user.findMany.mock.calls[0][0] as {
      where: { role: { in: string[] } };
    };
    const roles = new Set(arg.where.role.in);
    expect(roles).toEqual(
      new Set(["owner", "head_office", "admin", "member", "eos", "eos_implementer"]),
    );
  });
});
