/**
 * Parents book in OWNA, not the portal. Hiding the Bookings page isn't
 * enough — these routes are reachable directly — so every booking WRITE
 * refuses while PARENT_PORTAL_LOCKED is on, and touches nothing.
 */
import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";
import { ApiError } from "@/lib/api-error";
import {
  PARENT_PORTAL_LOCKED,
  isAllowedWhileLocked,
} from "@/lib/parent-portal-lockdown";

vi.mock("@/lib/parent-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/parent-auth")>(
    "@/lib/parent-auth",
  );
  return {
    ...actual,
    withParentAuth:
      (handler: (req: unknown, ctx: unknown) => Promise<Response>) =>
      async (req: unknown, ctx?: { params?: Promise<Record<string, string>> }) => {
        try {
          return await handler(req, {
            parent: { email: "p1@x.test", enrolmentIds: ["enr1"] },
            params: ctx?.params ?? Promise.resolve({ bookingId: "b1" }),
          });
        } catch (err) {
          if (err instanceof ApiError) {
            return new Response(JSON.stringify({ error: err.message }), {
              status: err.status,
              headers: { "content-type": "application/json" },
            });
          }
          throw err;
        }
      },
  };
});

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

const body = { childId: "c1", date: "2026-11-02", sessionType: "asc" };

async function expectRefused(res: Response) {
  expect(res.status).toBe(403);
  const json = await res.json();
  expect(json.error).toMatch(/OWNA/);
}

describe("parent booking writes while the portal is locked", () => {
  it("the portal ships locked", () => {
    expect(PARENT_PORTAL_LOCKED).toBe(true);
  });

  it("refuses a single booking", async () => {
    const { POST } = await import("@/app/api/parent/bookings/route");
    await expectRefused(
      await POST(createRequest("POST", "/api/parent/bookings", { body }) as never, {} as never),
    );
  });

  it("refuses a bulk booking", async () => {
    const { POST } = await import("@/app/api/parent/bookings/bulk/route");
    await expectRefused(
      await POST(
        createRequest("POST", "/api/parent/bookings/bulk", { body: { bookings: [body] } }) as never,
        {} as never,
      ),
    );
  });

  it("refuses changing or cancelling a booking", async () => {
    const { PATCH, DELETE } = await import("@/app/api/parent/bookings/[bookingId]/route");
    await expectRefused(
      await PATCH(createRequest("PATCH", "/api/parent/bookings/b1", { body: {} }) as never, {} as never),
    );
    await expectRefused(
      await DELETE(createRequest("DELETE", "/api/parent/bookings/b1") as never, {} as never),
    );
  });

  it("refuses marking an absence", async () => {
    const { POST } = await import("@/app/api/parent/absences/route");
    await expectRefused(
      await POST(createRequest("POST", "/api/parent/absences", { body }) as never, {} as never),
    );
  });

  it("writes nothing to the database", () => {
    expect(prismaMock.booking.create).not.toHaveBeenCalled();
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });
});

describe("pages that stay open while locked", () => {
  it.each([
    "/parent/enrol",
    "/parent/enrol/thank-you",
    "/parent/messages",
    "/parent/messages/abc",
    "/parent/my-centre",
    "/parent/account/security",
  ])("%s is open", (p) => expect(isAllowedWhileLocked(p)).toBe(true));

  it.each(["/parent", "/parent/bookings", "/parent/billing", "/parent/enrolments", "/parent/children"])(
    "%s shows the notice",
    (p) => expect(isAllowedWhileLocked(p)).toBe(false),
  );
});
