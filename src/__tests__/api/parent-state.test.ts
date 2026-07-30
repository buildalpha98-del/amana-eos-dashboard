import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { NextResponse } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

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

vi.mock("jose", () => ({ SignJWT: vi.fn(), jwtVerify: vi.fn() }));

interface TestParent {
  email: string;
  name: string;
  enrolmentIds: string[];
  accountId?: string;
}
type Handler = (
  req: Request,
  ctx: { parent: TestParent },
) => Promise<NextResponse>;

const _parentSession: { current: TestParent | null } = { current: null };

vi.mock("@/lib/parent-auth", () => ({
  getParentSession: vi.fn(() => Promise.resolve(_parentSession.current)),
  signParentJwt: vi.fn(),
  verifyParentJwt: vi.fn(),
  setParentSessionCookie: vi.fn((res: unknown) => res),
  withParentAuth: (handler: Handler) => {
    return async (req: Request, routeCtx?: Record<string, unknown>) => {
      const parent = _parentSession.current;
      if (!parent) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return handler(req, { ...routeCtx, parent });
    };
  },
}));

const routeModule = await import("@/app/api/parent/state/route");
const GET = routeModule.GET as unknown as (r: Request) => Promise<NextResponse>;

const req = () => new Request("http://localhost/api/parent/state");

/** beforeEach always populates this, so the null branch is unreachable. */
const session = () => _parentSession.current as TestParent;

beforeEach(() => {
  vi.clearAllMocks();
  _parentSession.current = {
    email: "parent@example.com",
    name: "Aisha Rahman",
    enrolmentIds: [],
    accountId: "acct_1",
  };
  prismaMock.enrolmentSubmission.findMany.mockResolvedValue([]);
  prismaMock.enrolmentDraft.findUnique.mockResolvedValue(null);
});

describe("GET /api/parent/state", () => {
  it("sends a brand-new account into the enrolment form", async () => {
    const res = await GET(req());
    const body = await res.json();
    expect(body.state).toBe("needs_enrolment");
  });

  it("does NOT bounce a family back into a form they just submitted", async () => {
    // The regression Daniel hit. enrolmentIds is signed into the JWT at
    // LOGIN, so an enrolment created afterwards can never appear in it —
    // leaving the session looking like a family with no enrolment at all.
    session().enrolmentIds = [];
    prismaMock.enrolmentDraft.findUnique.mockResolvedValue({
      currentStep: 4,
      submittedAt: new Date(),
    } as never);

    const res = await GET(req());
    const body = await res.json();

    expect(body.state).toBe("pending_review");
    expect(body.hasDraft).toBe(false);
  });

  it("keeps an unfinished draft in needs_enrolment", async () => {
    prismaMock.enrolmentDraft.findUnique.mockResolvedValue({
      currentStep: 2,
      submittedAt: null,
    } as never);

    const res = await GET(req());
    const body = await res.json();

    expect(body.state).toBe("needs_enrolment");
    expect(body.hasDraft).toBe(true);
    expect(body.draftStep).toBe(2);
  });

  it("reports pending_review from the enrolment itself once the JWT catches up", async () => {
    session().enrolmentIds = ["enr_1"];
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { status: "submitted" },
    ] as never);

    const res = await GET(req());
    expect((await res.json()).state).toBe("pending_review");
  });

  it("opens the portal once staff approve", async () => {
    session().enrolmentIds = ["enr_1"];
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { status: "approved" },
    ] as never);
    // A submitted draft must not drag an APPROVED family back down to
    // pending_review — the override only ever lifts, never lowers.
    prismaMock.enrolmentDraft.findUnique.mockResolvedValue({
      currentStep: 4,
      submittedAt: new Date(),
    } as never);

    const res = await GET(req());
    expect((await res.json()).state).toBe("active");
  });

  it("flags a pre-account magic-link session as not account-backed", async () => {
    session().accountId = undefined;
    const res = await GET(req());
    const body = await res.json();
    expect(body.accountBacked).toBe(false);
    expect(body.state).toBe("needs_enrolment");
  });

  it("401s without a session", async () => {
    _parentSession.current = null;
    const res = await GET(req());
    expect(res.status).toBe(401);
  });
});
