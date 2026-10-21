import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { executeToolCall, getAssistantTools } from "@/lib/ai-tools";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { ROLES } from "@/lib/role-enum";
import { searchChunks } from "@/lib/document-indexer";

vi.mock("@/lib/document-indexer", () => ({ searchChunks: vi.fn(async () => []), formatChunksForPrompt: vi.fn(() => "Scoped synthetic knowledge") }));
const viewer = { id: "synthetic-staff", role: "staff", serviceId: "centre-a" };
const adminTools = [
  ["lookup_service_details", { query: "centre-b" }],
  ["lookup_expiring_certificates", {}],
  ["lookup_financial_period", { month: 10, year: 2026 }],
  ["lookup_staff_list", {}],
  ["lookup_recent_todos", {}],
  ["lookup_enquiry_pipeline", {}],
] as const;
beforeEach(() => {
  vi.clearAllMocks();
  // The executor re-reads the account for administrative tools.
  prismaMock.user.findUnique.mockImplementation(async () => ({ active: true, role: "owner" }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response("<p>Public reference</p>")));
});
afterEach(() => vi.unstubAllGlobals());

describe("AI tool permissions", () => {
  it.each(ROLES.filter(role => !(ADMIN_ROLES as readonly string[]).includes(role)))("%s cannot execute administrative tools even with a forged role argument", async role => {
    for (const [name, input] of adminTools) {
      const result = await executeToolCall(name, { ...input, role: "owner" }, { ...viewer, role });
      expect(JSON.parse(result)).toEqual({ error: "Tool not permitted" });
    }
    for (const model of ["service", "complianceCertificate", "financialPeriod", "user", "todo", "lead"]) {
      expect(prismaMock[model].findMany).not.toHaveBeenCalled();
    }
    expect(prismaMock.lead.groupBy).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(ADMIN_ROLES)("preserves administrative financial lookup for %s", async role => {
    prismaMock.financialPeriod.findMany.mockResolvedValue([{ totalRevenue: 100, totalCosts: 40, service: { name: "Synthetic centre" } }]);
    const result = JSON.parse(await executeToolCall("lookup_financial_period", { month: 10, year: 2026 }, { ...viewer, role }));
    expect(result.totalRevenue).toBe(100);
    expect(prismaMock.financialPeriod.findMany).toHaveBeenCalledOnce();
  });

  it.each([
    ["deactivated", { active: false, role: "owner" }],
    ["demoted since the session was issued", { active: true, role: "staff" }],
    ["deleted", null],
  ])("re-checks the account before an administrative lookup: %s", async (_label, account) => {
    prismaMock.user.findUnique.mockImplementation(async () => account);
    const result = await executeToolCall("lookup_financial_period", { month: 10, year: 2026 }, { ...viewer, role: "owner" });
    expect(JSON.parse(result)).toEqual({ error: "Tool not permitted" });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: viewer.id } }));
    expect(prismaMock.financialPeriod.findMany).not.toHaveBeenCalled();
  });

  it("passes trusted viewer scope through knowledge search", async () => {
    await executeToolCall("search_knowledge_base", { query: "first aid" }, viewer);
    expect(searchChunks).toHaveBeenCalledWith("first aid", 8, viewer);
  });

  it.each([{ ...viewer, id: "" }, { ...viewer, role: "unknown" }])("fails closed for missing or invalid identity", async identity => {
    expect(getAssistantTools(identity)).toEqual([]);
    expect(JSON.parse(await executeToolCall("search_knowledge_base", { query: "first aid" }, identity))).toEqual({ error: "Tool not permitted" });
    expect(searchChunks).not.toHaveBeenCalled();
  });

  it("advertises exactly the permitted tools and rejects unknown names", async () => {
    expect(getAssistantTools(viewer).map(tool => tool.name)).toEqual(["fetch_oshc_reference", "search_knowledge_base"]);
    expect(getAssistantTools({ ...viewer, role: "owner" })).toHaveLength(8);
    expect(JSON.parse(await executeToolCall("delete_all_data", {}, { ...viewer, role: "owner" }))).toEqual({ error: "Tool not permitted" });
  });

  it.each([
    ["lookup_financial_period", { month: 13, year: 2026 }],
    ["lookup_financial_period", { month: 1, year: "2026" }],
    ["lookup_recent_todos", { limit: -1 }],
    ["lookup_recent_todos", { limit: 100000 }],
    ["lookup_staff_list", { role: "invalid" }],
    ["lookup_expiring_certificates", { withinDays: 999999 }],
    ["search_knowledge_base", { query: "   " }],
    ["search_knowledge_base", { query: "first aid", viewer: { role: "owner" } }],
    ["fetch_oshc_reference", null],
  ])("validates input before executing %s", async (name, input) => {
    const result = await executeToolCall(name as string, input, { ...viewer, role: "owner" });
    expect(JSON.parse(result)).toEqual({ error: "Invalid tool input" });
    expect(searchChunks).not.toHaveBeenCalled();
    expect(prismaMock.financialPeriod.findMany).not.toHaveBeenCalled();
    expect(prismaMock.todo.findMany).not.toHaveBeenCalled();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(prismaMock.complianceCertificate.findMany).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not send database error details back to the model", async () => {
    prismaMock.financialPeriod.findMany.mockRejectedValue(new Error("SYNTHETIC_PRIVATE_DATABASE_DETAIL"));
    expect(JSON.parse(await executeToolCall("lookup_financial_period", { month: 10, year: 2026 }, { ...viewer, role: "owner" }))).toEqual({ error: "Tool execution failed" });
  });
});

describe("AI reference fetching", () => {
  it.each([
    "http://www.acecqa.gov.au/test",
    "https://user@www.acecqa.gov.au/test",
    "https://www.acecqa.gov.au:8443/test",
    "https://example.invalid/test",
    "https://www.acecqa.gov.au.example.invalid/test",
  ])("refuses unsafe destination %s", async url => {
    expect(JSON.parse(await executeToolCall("fetch_oshc_reference", { url }, viewer))).toHaveProperty("error");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requests allowed references without redirects and with a body timeout", async () => {
    const url = "https://www.acecqa.gov.au/test";
    const result = JSON.parse(await executeToolCall("fetch_oshc_reference", { url }, viewer));
    expect(result.content).toBe("Public reference");
    expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }));
  });

  it("fails safely when fetch rejects a redirect", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("SYNTHETIC_PRIVATE_DESTINATION"));
    expect(JSON.parse(await executeToolCall("fetch_oshc_reference", { url: "https://www.acecqa.gov.au/test" }, viewer))).toEqual({ error: "Source could not be fetched safely" });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
