import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { POST } from "@/app/api/assistant/chat/route";
import { getAI } from "@/lib/ai";
import { buildDashboardContext } from "@/lib/ai-context";
import { searchChunks } from "@/lib/document-indexer";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));
vi.mock("@/lib/ai", () => ({ getAI: vi.fn() }));
vi.mock("@/lib/ai-context", () => ({ buildDashboardContext: vi.fn(async () => "Synthetic admin context") }));
vi.mock("@/lib/document-indexer", () => ({ searchChunks: vi.fn(async () => []), formatChunksForPrompt: vi.fn() }));

const user = { id: "synthetic-educator", name: "Synthetic educator", role: "staff" as const, serviceId: "centre-a" };
const request = () => createRequest("POST", "/api/assistant/chat", { body: { messages: [{ role: "user", content: "Synthetic adversarial model test" }] } });

function modelCalling(name: string, input: unknown) {
  const requests: Array<{ tools: Array<{ name: string }>; messages: unknown[] }> = [];
  const stream = vi.fn(args => {
    requests.push(structuredClone(args));
    const first = requests.length === 1;
    return {
      on: vi.fn(),
      finalMessage: async () => first
        ? { stop_reason: "tool_use", content: [{ type: "tool_use", id: "synthetic-tool", name, input }] }
        : { stop_reason: "end_turn", content: [{ type: "text", text: "Done" }] },
    };
  });
  vi.mocked(getAI).mockReturnValue({ messages: { stream } } as never);
  return requests;
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  mockSession(user);
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.financialPeriod.findMany.mockResolvedValue([{ totalRevenue: 100, totalCosts: 40, service: { name: "SYNTHETIC_FINANCIAL_CANARY" } }]);
});

describe("chat rejects unadvertised tools from model output", () => {
  it.each(["staff", "member", "marketing", "eos_viewer", "eos_implementer", "eos"] as const)("denies financial tool output for %s without accessing or forwarding data", async role => {
    mockSession({ ...user, role });
    const requests = modelCalling("lookup_financial_period", { month: 10, year: 2026 });
    const response = await POST(request());
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("[DONE]");
    expect(requests[0].tools.map(tool => tool.name)).not.toContain("lookup_financial_period");
    expect(prismaMock.financialPeriod.findMany).not.toHaveBeenCalled();
    expect(buildDashboardContext).not.toHaveBeenCalled();
    expect(JSON.stringify(requests[1].messages)).toContain("Tool not permitted");
    expect(JSON.stringify(requests[1].messages)).toContain('"is_error":true');
    expect(JSON.stringify(requests)).not.toContain("SYNTHETIC_FINANCIAL_CANARY");
  });

  it("keeps authorised owner lookups working", async () => {
    mockSession({ ...user, role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "owner" });
    const requests = modelCalling("lookup_financial_period", { month: 10, year: 2026 });
    await (await POST(request())).text();
    expect(prismaMock.financialPeriod.findMany).toHaveBeenCalledOnce();
    expect(JSON.stringify(requests[1].messages)).toContain("SYNTHETIC_FINANCIAL_CANARY");
  });

  it("keeps educator knowledge searches scoped to the session", async () => {
    modelCalling("search_knowledge_base", { query: "medication policy" });
    await (await POST(request())).text();
    expect(searchChunks).toHaveBeenCalledWith("medication policy", 8, { id: user.id, role: user.role, serviceId: user.serviceId });
  });

  it("does not call the provider without a session", async () => {
    mockNoSession();
    expect((await POST(request())).status).toBe(401);
    expect(getAI).not.toHaveBeenCalled();
  });
});
