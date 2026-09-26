import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 59, resetIn: 60000 })) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, generateRequestId: () => "t" }));
const { buildDashboardContext, captured } = vi.hoisted(() => ({
  buildDashboardContext: vi.fn(async () => "FINANCIALS-SECRET"),
  captured: [] as { system?: string; tools?: { name: string }[] }[],
}));
vi.mock("@/lib/ai-context", () => ({ buildDashboardContext: () => buildDashboardContext() }));
vi.mock("@/lib/knowledge/scope", () => ({ buildKnowledgeScope: vi.fn(async () => ({ role: "staff", serviceIds: ["s1"], state: null })) }));
vi.mock("@/lib/ai", () => ({
  getAI: () => ({
    messages: {
      stream: (args: { system: string; tools?: { name: string }[] }) => {
        captured.push(args);
        return {
          on: () => {},
          finalMessage: async () => ({ content: [{ type: "text", text: "hi" }], stop_reason: "end_turn" }),
        };
      },
    },
  }),
}));

import { POST } from "@/app/api/assistant/chat/route";

async function drain(res: Response) { await res.text(); }

describe("assistant chat — role gating", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    captured.length = 0;
    vi.clearAllMocks();
    buildDashboardContext.mockResolvedValue("FINANCIALS-SECRET");
    prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "staff" });
  });

  it("staff never receive the dashboard financial context", async () => {
    mockSession({ id: "u1", name: "Ed", role: "staff", serviceId: "s1" });
    const res = await POST(createRequest("POST", "/api/assistant/chat", { body: { messages: [{ role: "user", content: "hello" }] } }));
    await drain(res);
    expect(buildDashboardContext).not.toHaveBeenCalled();
    expect(captured[0]?.system).not.toContain("FINANCIALS-SECRET");
    // Order follows ASSISTANT_TOOLS' declaration order (fetch_oshc_reference,
    // then search_knowledge) — sort before comparing so the assertion checks
    // the exact tool SET, not an incidental array position.
    expect(captured[0]?.tools?.map((t: { name: string }) => t.name).sort()).toEqual(
      ["fetch_oshc_reference", "search_knowledge"].sort(),
    );
  });

  it("owner still receives it", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "owner" });
    mockSession({ id: "u2", name: "Own", role: "owner" });
    const res = await POST(createRequest("POST", "/api/assistant/chat", { body: { messages: [{ role: "user", content: "hello" }] } }));
    await drain(res);
    expect(captured[0]?.system).toContain("FINANCIALS-SECRET");
    const toolNames = captured[0]?.tools?.map((t: { name: string }) => t.name);
    expect(toolNames).toContain("lookup_financial_period");
    expect(toolNames).toContain("search_knowledge");
  });
});
