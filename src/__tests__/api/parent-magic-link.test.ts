/**
 * The parent "forgot password" path — a magic login link.
 *
 * Regression coverage for a live bug (2026-08-06): the lookup used to
 * fetch enrolments with `take: 100` and scan them in memory for a
 * matching email, because the address lives inside the primaryParent
 * JSON. With 1,000+ enrolments, any parent outside that arbitrary
 * window was reported as "unknown email" — no link sent, but the page
 * still said one had been. No `orderBy` either, so the same parent
 * could work once and fail the next time.
 *
 * These tests pin the two things that matter: the lookup asks the
 * DATABASE rather than scanning a page of rows, and a parent blocked by
 * the suppression list is loud in the logs even though the page stays
 * deliberately vague.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

const resendSend = vi.fn();
const loggerError = vi.fn();
const loggerInfo = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 2, resetIn: 60_000 }),
  ),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: (...a: unknown[]) => loggerInfo(...a),
    warn: vi.fn(),
    error: (...a: unknown[]) => loggerError(...a),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));
/*
 * `getResend`, not `sendEmail`. The route now sends directly so that
 * suppression can't block account recovery — see the route's own note,
 * and the bypass guard's allowlist.
 */
vi.mock("@/lib/email", () => ({
  getResend: () => ({ emails: { send: (...a: unknown[]) => resendSend(...a) } }),
  FROM_EMAIL: "Amana OSHC <test@example.com>",
}));
vi.mock("@/lib/email-templates", () => ({
  parentMagicLinkEmail: vi.fn(() =>
    Promise.resolve({ subject: "Your link", html: "<p>link</p>" }),
  ),
}));

import { POST } from "@/app/api/parent/auth/send-link/route";

const req = (email: string) =>
  createRequest("POST", "/api/parent/auth/send-link", { body: { email } });

describe("POST /api/parent/auth/send-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.parentEnquiry.findFirst.mockResolvedValue(null);
    prismaMock.parentMagicLink.create.mockResolvedValue({ id: "ml-1" });
    resendSend.mockResolvedValue({ data: { id: "msg-1" }, error: null });
  });

  it("asks the database for the email instead of scanning a page of rows", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "enr-1", first_name: "Aysha", surname: "Khan" },
    ]);
    const res = await POST(req("Aysha@Example.com"));
    expect(res.status).toBe(200);
    // The old implementation called findMany with take: 100. If that
    // ever comes back, this fails.
    expect(prismaMock.enrolmentSubmission.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
    expect(resendSend).toHaveBeenCalledTimes(1);
  });

  it("finds a parent regardless of how many enrolments exist", async () => {
    // The query returns the match wherever it lives in the table — the
    // exact case that used to fail.
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "enr-999", first_name: "Mo", surname: "Ali" },
    ]);
    await POST(req("mo@example.com"));
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(prismaMock.parentMagicLink.create).toHaveBeenCalled();
  });

  it("sends nothing for an unknown email, and doesn't say so", async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    const res = await POST(req("stranger@example.com"));
    const body = await res.json();
    expect(res.status).toBe(200);
    // Same response as success — the page must not reveal which
    // addresses are registered.
    expect(body.success).toBe(true);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("sends anyway when the address is on the suppression list", async () => {
    // CHANGED 2026-08-13. This used to assert that suppression blocked
    // the send and shouted in the logs. Logging it was only half an
    // answer: it tells STAFF, while the parent stays locked out of
    // their own child's enrolment until someone reads the log and acts.
    //
    // This link IS the parent's forgot-password path — there is no
    // other. Suppression protects sender reputation on mail people can
    // live without; it must not gate account recovery. The staff
    // password reset already worked this way.
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "enr-1", first_name: "Aysha", surname: "Khan" },
    ]);
    const res = await POST(req("aysha@example.com"));

    expect(res.status).toBe(200);
    expect(resendSend).toHaveBeenCalledTimes(1);
  });

  it("logs when the provider rejects, rather than reporting success", async () => {
    // Resend resolves with `{ error }` instead of throwing, so the
    // try/catch this replaces never fired and a rejected send was
    // logged as "sent".
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "enr-1", first_name: "Aysha", surname: "Khan" },
    ]);
    resendSend.mockResolvedValue({
      data: null,
      error: { message: "Domain is not verified", name: "validation_error" },
    });

    const res = await POST(req("aysha@example.com"));

    // The parent still sees the vague message — the response must not
    // differ by whether the account exists.
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const rejected = loggerError.mock.calls.find((c) =>
      String(c[0]).includes("rejected by provider"),
    );
    expect(rejected).toBeTruthy();
  });
});
