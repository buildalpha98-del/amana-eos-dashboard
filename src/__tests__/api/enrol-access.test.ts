/**
 * Who can submit an enrolment, and who can read a family's details.
 *
 * Two endpoints built for the anonymous enrolment form at `/enrol`.
 * That form retired on 2026-07-30; both outlived it by months.
 *
 * - `POST /api/enrol` stayed open to the internet, creating
 *   `EnrolmentSubmission` and `Child` rows for anyone who found it. It
 *   is NOT closed — `/parent/children/new` renders the same wizard for
 *   a signed-in parent enrolling a sibling — so the fix is the gate
 *   those parents already pass.
 * - `GET /api/enrol/[token]` handed out a parent's email, phone and
 *   their child's name to anyone holding an enquiry id. Those ids
 *   travel in emailed links, so they reach browser history, referrer
 *   headers and whoever the mail gets forwarded to.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false })),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

import { GET } from "@/app/api/enrol/[token]/route";

const call = (id = "enq-1") =>
  GET(createRequest("GET", `/api/enrol/${id}`), {
    params: Promise.resolve({ token: id }),
  });

const enquiry = (over: Record<string, unknown> = {}) => ({
  id: "enq-1",
  parentName: "Aysha Khan",
  parentEmail: "aysha@example.com",
  createdAt: new Date(),
  deleted: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.parentEnquiry.findUnique.mockResolvedValue(enquiry());
});

describe("GET /api/enrol/[token] — what it hands out", () => {
  it("gives signup the name and email it needs", async () => {
    const body = await (await call()).json();
    expect(body.prefill).toEqual({
      firstName: "Aysha",
      surname: "Khan",
      email: "aysha@example.com",
    });
  });

  it("no longer hands out a phone number or a child's name", async () => {
    // It used to return parentPhone, childName and the whole
    // childrenDetails blob, because it filled an entire enrolment form.
    // That form is gone; signup asks for a name and an email.
    const body = await (await call()).json();
    const serialised = JSON.stringify(body);
    expect(serialised).not.toMatch(/phone/i);
    expect(serialised).not.toMatch(/child/i);
  });

  it("doesn't select the fields it no longer returns", async () => {
    // Not selecting them is the guarantee. Fetching and then dropping
    // is one careless spread away from leaking again.
    await call();
    const arg = prismaMock.parentEnquiry.findUnique.mock.calls[0][0] as {
      select: Record<string, unknown>;
    };
    expect(arg.select).not.toHaveProperty("parentPhone");
    expect(arg.select).not.toHaveProperty("childName");
    expect(arg.select).not.toHaveProperty("childrenDetails");
  });

  it("copes with a one-word name rather than inventing a surname", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue(
      enquiry({ parentName: "Aysha" }),
    );
    const body = await (await call()).json();
    expect(body.prefill).toMatchObject({ firstName: "Aysha", surname: "" });
  });
});

describe("GET /api/enrol/[token] — when it refuses", () => {
  it("expires a link after the prefill window", async () => {
    // The enquiry row lives forever; the link's usefulness does not. A
    // link found in a forwarded email two years later shouldn't still
    // hand out an address.
    prismaMock.parentEnquiry.findUnique.mockResolvedValue(
      enquiry({
        createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
      }),
    );
    expect((await call()).status).toBe(404);
  });

  it("still serves a link inside the window", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue(
      enquiry({ createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }),
    );
    expect((await call()).status).toBe(200);
  });

  it("refuses a deleted enquiry", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue(
      enquiry({ deleted: true }),
    );
    expect((await call()).status).toBe(404);
  });

  it("answers the same for unknown, deleted and expired", async () => {
    // Otherwise it's an oracle: feed it ids, learn which are real
    // enquiries, without ever seeing a name.
    prismaMock.parentEnquiry.findUnique.mockResolvedValue(null);
    const unknown = await call();
    prismaMock.parentEnquiry.findUnique.mockResolvedValue(
      enquiry({ deleted: true }),
    );
    const deleted = await call();
    prismaMock.parentEnquiry.findUnique.mockResolvedValue(
      enquiry({ createdAt: new Date(0) }),
    );
    const expired = await call();

    const bodies = await Promise.all([
      unknown.json(),
      deleted.json(),
      expired.json(),
    ]);
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect([unknown.status, deleted.status, expired.status]).toEqual([
      404, 404, 404,
    ]);
  });
});

/**
 * The gate on the submission endpoint itself.
 *
 * Kept in its own file-level mock scope because `enrol.test.ts` stubs
 * parent auth THROUGH, so it can keep testing the stage-event logging
 * it was written for. Here the real wrapper runs.
 */
describe("POST /api/enrol — requires a parent session", () => {
  it("refuses a caller with no parent session", async () => {
    // It was open to the internet for months after the anonymous form
    // that fed it was retired, creating EnrolmentSubmission and Child
    // rows for anyone who found the URL.
    const { POST } = await import("@/app/api/enrol/route");
    const res = await POST(
      createRequest("POST", "/api/enrol", { body: {} }),
      undefined as never,
    );
    expect(res.status).toBe(401);
  });

  it("does not reach the database before authenticating", async () => {
    // A gate that runs after the write isn't a gate.
    const { POST } = await import("@/app/api/enrol/route");
    await POST(
      createRequest("POST", "/api/enrol", { body: {} }),
      undefined as never,
    );
    expect(prismaMock.enrolmentSubmission.create).not.toHaveBeenCalled();
  });
});
