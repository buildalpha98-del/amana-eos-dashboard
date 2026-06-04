/**
 * Regression test for the stale Zod cert-type enum.
 *
 * Background: the createCertSchema / updateCertSchema were hard-coded
 * literal lists that missed the newer Prisma CertificateType values
 * (child_protection / geccko / food_safety / food_handler /
 * mandatory_reporter_training / child_safe_code_of_conduct). Staff
 * uploading a Child Safe Code of Conduct cert hit "Invalid option".
 *
 * 2026-06-04 fix: both schemas now use z.nativeEnum(CertificateType).
 * This test locks in that the newer types pass validation so we don't
 * drift again when the Prisma enum is extended in future.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

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
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

vi.mock("@/lib/storage", () => ({
  uploadFile: vi.fn(() => Promise.resolve({ url: "https://blob/new.pdf" })),
  deleteFile: vi.fn(() => Promise.resolve()),
}));

import { POST } from "@/app/api/compliance/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// The Prisma CertificateType enum was extended over time. Anything in
// this list must validate cleanly — and never regress.
const NEW_CERT_TYPES = [
  "wwcc",
  "first_aid",
  "child_protection",
  "geccko",
  "food_safety",
  "food_handler",
  "mandatory_reporter_training",
  "child_safe_code_of_conduct",
  "other",
];

describe("POST /api/compliance — cert type validation tracks Prisma enum", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({
      active: true,
      serviceId: "svc-1",
    });
    prismaMock.complianceCertificate.create.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "cert-new", ...args.data }),
    );
    prismaMock.activityLog.create.mockResolvedValue({} as never);
  });

  it.each(NEW_CERT_TYPES)("accepts type=%s", async (type) => {
    const res = await POST(
      createRequest("POST", "/api/compliance", {
        body: {
          serviceId: "svc-1",
          userId: "user-1",
          type,
          label: `Test ${type}`,
          issueDate: todayIso(),
          expiryDate: null,
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
  });

  it("still rejects garbage cert types", async () => {
    const res = await POST(
      createRequest("POST", "/api/compliance", {
        body: {
          serviceId: "svc-1",
          userId: "user-1",
          type: "not_a_real_type",
          issueDate: todayIso(),
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
  });
});
