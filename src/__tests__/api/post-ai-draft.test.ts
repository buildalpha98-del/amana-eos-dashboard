/**
 * Amana AI post drafting.
 *
 * The rule that matters: curriculum tags are validated against the real
 * frameworks server-side. A model asked for "the relevant MTOP outcome"
 * will cheerfully invent "Outcome 6: Creativity", and a tag that isn't in
 * the framework is worse than no tag — it's the one an assessor picks up
 * on. Everything the model returns is filtered, never trusted.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

const create = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
  ),
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
vi.mock("@/lib/ai", () => ({
  getAI: () => ({ messages: { create } }),
}));
vi.mock("@/lib/ai-system-prompt", () => ({ AMANA_SYSTEM_PROMPT: "sys" }));

import { POST } from "@/app/api/services/[id]/posts/ai-draft/route";

const ctx = (id = "svc-1") => ({ params: Promise.resolve({ id }) });
const req = (body: Record<string, unknown>) =>
  createRequest("POST", "/api/services/svc-1/posts/ai-draft", { body });

function aiReplies(text: string) {
  create.mockResolvedValue({
    content: [{ type: "text", text }],
    usage: { input_tokens: 10, output_tokens: 20 },
  });
}

describe("POST /api/services/[id]/posts/ai-draft", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.aiUsage.create.mockResolvedValue({ id: "u-1" });
  });

  it("returns a draft with valid curriculum tags", async () => {
    mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
    aiReplies(
      JSON.stringify({
        title: "Obstacle course in the hall",
        content: "The group built a course this afternoon…",
        mtop: ["Wellbeing", "Learning"],
        nqs: ["QA1"],
      }),
    );
    const res = await POST(req({ notes: "built an obstacle course" }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Obstacle course in the hall");
    expect(body.mtop).toEqual(["Wellbeing", "Learning"]);
    expect(body.nqs).toEqual(["QA1"]);
  });

  it("drops invented outcomes and quality areas", async () => {
    mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
    aiReplies(
      JSON.stringify({
        title: "T",
        content: "C",
        // "Creativity" is not an MTOP outcome; QA9 does not exist.
        mtop: ["Wellbeing", "Creativity", "Outcome 4"],
        nqs: ["QA1", "QA9", "quality area 3"],
      }),
    );
    const body = await (
      await POST(req({ notes: "painting" }), ctx())
    ).json();
    expect(body.mtop).toEqual(["Wellbeing"]);
    expect(body.nqs).toEqual(["QA1"]);
  });

  it("copes with a fenced JSON reply", async () => {
    mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
    aiReplies(
      '```json\n{"title":"T","content":"C","mtop":[],"nqs":[]}\n```',
    );
    const res = await POST(req({ notes: "cooking" }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("T");
  });

  it("fails honestly when the reply isn't usable", async () => {
    mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
    aiReplies("I'm sorry, I can't help with that.");
    const res = await POST(req({ notes: "cooking" }), ctx());
    // Better to say so than to hand back an empty post.
    expect(res.status).toBe(400);
  });

  it("refuses an educator from another centre", async () => {
    mockSession({
      id: "u-ed",
      name: "Ed",
      role: "staff",
      serviceId: "svc-OTHER",
    });
    const res = await POST(req({ notes: "cooking" }), ctx());
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("needs actual notes to work from", async () => {
    mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
    const res = await POST(req({ notes: "x" }), ctx());
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("still returns the draft when usage logging fails", async () => {
    mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
    aiReplies(JSON.stringify({ title: "T", content: "C", mtop: [], nqs: [] }));
    prismaMock.aiUsage.create.mockRejectedValue(new Error("db down"));
    const res = await POST(req({ notes: "gardening today" }), ctx());
    // Losing the draft because a metrics row failed would be absurd.
    expect(res.status).toBe(200);
  });

  it("tells the model not to name individual children", async () => {
    mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
    aiReplies(JSON.stringify({ title: "T", content: "C", mtop: [], nqs: [] }));
    await POST(req({ notes: "painting with the group" }), ctx());
    const prompt = create.mock.calls[0][0].messages[0].content as string;
    // Other families see this post.
    expect(prompt).toContain("Never name individual children");
    expect(prompt).toContain("Never invent detail");
  });
});
