import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));
vi.mock("@/lib/email-branding", () => ({
  getEmailBranding: async () => ({
    name: "Amana OSHC", primaryColor: "#004E64", websiteUrl: "https://x.test", websiteUrlLabel: "x",
  }),
}));

type SendArgs = { to: string; subject: string; html: string };
const sendEmailMock = vi.fn(async (p: SendArgs) => ({
  sent: [p.to] as string[],
  suppressed: [] as string[],
  messageId: "m-1",
  failed: undefined as { message: string } | undefined,
}));
vi.mock("@/lib/email", () => ({
  getResend: () => ({}),
  FROM_EMAIL: "test@example.com",
  sendEmail: (p: SendArgs) => sendEmailMock(p),
}));

import { GET } from "@/app/api/sequences/preview/route";
import { POST } from "@/app/api/sequences/preview/send/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const SEQUENCES = [
  {
    id: "seq-parent",
    name: "New Enquiry Journey",
    type: "parent_nurture",
    triggerStage: "new_enquiry",
    isActive: true,
    _count: { enrolments: 4 },
    steps: [
      { id: "st-1", stepNumber: 1, name: "Welcome", delayHours: 0, templateKey: "welcome", emailTemplate: null },
    ],
  },
  {
    id: "seq-crm",
    name: "New School Introduction",
    type: "crm_outreach",
    triggerStage: "new_lead",
    isActive: true,
    _count: { enrolments: 0 },
    steps: [
      { id: "st-2", stepNumber: 1, name: "Intro Email", delayHours: 0, templateKey: "school_intro", emailTemplate: null },
    ],
  },
];

function setupDb() {
  prismaMock.user.findUnique.mockImplementation(async (args: { where?: { id?: string } }) => {
    if (args?.where?.id) return { active: true, id: args.where.id, role: "marketing" };
    return null;
  });
  prismaMock.user.findFirst.mockImplementation(
    async (args: { where?: { email?: { equals?: string } } }) =>
      args?.where?.email?.equals?.toLowerCase() === "shahbaz@amanaoshc.com.au"
        ? { email: "Shahbaz@amanaoshc.com.au", name: "Shahbaz" }
        : null,
  );
  prismaMock.sequence.findMany.mockImplementation(async (args: { where?: { id?: { in: string[] } } }) =>
    args?.where?.id ? SEQUENCES.filter((s) => args.where!.id!.in.includes(s.id)) : SEQUENCES,
  );
  prismaMock.service.findFirst.mockResolvedValue({
    name: "Amana Greenacre", code: "GRN", address: "1 Test St", suburb: "Greenacre", state: "NSW", orientationVideoUrl: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  setupDb();
});

describe("GET /api/sequences/preview", () => {
  it("401s without a session", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/sequences/preview"));
    expect(res.status).toBe(401);
  });

  it("403s for centre roles", async () => {
    mockSession({ id: "u-staff", name: "Educator", role: "staff" });
    const res = await GET(createRequest("GET", "/api/sequences/preview"));
    expect(res.status).toBe(403);
  });

  it("renders every step and flags steps with no template", async () => {
    mockSession({ id: "u-mkt", name: "Marketing", role: "marketing" });
    const res = await GET(createRequest("GET", "/api/sequences/preview"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sampleCentre).toBe("Amana Greenacre");
    expect(body.flows).toHaveLength(2);

    const welcome = body.flows[0].steps[0];
    expect(welcome.source).toBe("default");
    expect(welcome.html).toContain("Sarah");
    expect(body.flows[0].activeEnrolments).toBe(4);

    const intro = body.flows[1].steps[0];
    expect(intro.source).toBe("missing");
  });
});

describe("POST /api/sequences/preview/send", () => {
  it("401s without a session", async () => {
    mockNoSession();
    const res = await POST(createRequest("POST", "/api/sequences/preview/send", { body: { to: "shahbaz@amanaoshc.com.au" } }));
    expect(res.status).toBe(401);
  });

  it("403s for centre roles", async () => {
    mockSession({ id: "u-member", name: "Coordinator", role: "member" });
    const res = await POST(createRequest("POST", "/api/sequences/preview/send", { body: { to: "shahbaz@amanaoshc.com.au" } }));
    expect(res.status).toBe(403);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("400s on an invalid address", async () => {
    mockSession({ id: "u-mkt", name: "Marketing", role: "marketing" });
    const res = await POST(createRequest("POST", "/api/sequences/preview/send", { body: { to: "not-an-email" } }));
    expect(res.status).toBe(400);
  });

  it("refuses anyone who isn't an active staff account", async () => {
    mockSession({ id: "u-mkt", name: "Marketing", role: "marketing" });
    const res = await POST(createRequest("POST", "/api/sequences/preview/send", { body: { to: "parent@gmail.com" } }));
    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sends an overview then one [Preview] email per step to the staff member", async () => {
    mockSession({ id: "u-mkt", name: "Marketing", role: "marketing" });
    const res = await POST(
      createRequest("POST", "/api/sequences/preview/send", {
        body: { to: "shahbaz@amanaoshc.com.au", sequenceIds: ["seq-parent"] },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ to: "Shahbaz@amanaoshc.com.au", total: 2, sent: 2, failed: [], suppressed: false });

    const subjects = sendEmailMock.mock.calls.map(([p]) => p.subject);
    expect(subjects[0]).toMatch(/^\[Preview\] Email flows overview/);
    expect(subjects[1]).toMatch(/^\[Preview\] New Enquiry Journey · 1\/1 · /);
    // Every send goes to the resolved staff address and nowhere else.
    expect(new Set(sendEmailMock.mock.calls.map(([p]) => p.to))).toEqual(new Set(["Shahbaz@amanaoshc.com.au"]));
    expect(sendEmailMock.mock.calls[1][0].html).toContain("Preview · <strong>New Enquiry Journey</strong>");
  });

  it("reports provider rejections instead of claiming success", async () => {
    mockSession({ id: "u-mkt", name: "Marketing", role: "marketing" });
    sendEmailMock.mockImplementation(async () => ({
      sent: [], suppressed: [], messageId: undefined as unknown as string, failed: { message: "domain not verified" },
    }));
    const res = await POST(
      createRequest("POST", "/api/sequences/preview/send", {
        body: { to: "shahbaz@amanaoshc.com.au", sequenceIds: ["seq-crm"] },
      }),
    );
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.failed).toHaveLength(2);
    expect(body.failed[0].error).toBe("domain not verified");
  });
});
