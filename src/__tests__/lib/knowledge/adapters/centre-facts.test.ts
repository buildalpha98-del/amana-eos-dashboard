import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const { upsert } = vi.hoisted(() => ({ upsert: vi.fn(async (_i?: unknown) => ({ sourceId: "s", outcome: "created" })) }));
vi.mock("@/lib/knowledge/pipeline", () => ({ upsertKnowledgeSource: (i: unknown) => upsert(i) }));
import { syncCentreFacts, renderCentreFacts } from "@/lib/knowledge/adapters/centre-facts";

const service = {
  id: "svc1", name: "Amana OSHC Doveton", address: "1 School Rd", phone: "0400 000 000", state: "Victoria",
  manager: { name: "Sara K", phone: "0411 111 111" }, // phone present in the row, must NOT be rendered
  content: {
    contacts: [{ role: "School office", name: "Reception", phone: "03 9000 0000", email: "" }],
    dailyRoutine: "BSC 6:45–9:00", foodProvider: "Halal Kitchen", locationWithinSchool: "Hall B",
    meetingPoints: "Oval", parentOnboarding: "", staffNotes: "Gate code 1234",
    about: "PARENT COPY", tagline: "", heroImage: "", enrolmentThankYou: "PARENT COPY",
  },
};

describe("centre_facts adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); prismaMock.service.findUnique.mockResolvedValue(service); });

  it("renders staff-facing fields only", () => {
    const md = renderCentreFacts(service as never);
    expect(md).toContain("# Amana OSHC Doveton");
    expect(md).toContain("Gate code 1234");
    expect(md).toContain("Sara K");
    expect(md).not.toContain("0411 111 111"); // manager's personal mobile is never indexed
    expect(md).toContain("Halal Kitchen");
    expect(md).not.toContain("PARENT COPY");
  });

  it("upserts scoped to the service with its canonical state and an EXPLICIT general tier (a fact sheet is never a procedure)", async () => {
    await syncCentreFacts("svc1");
    expect(upsert.mock.calls[0][0]).toMatchObject({
      sourceKind: "centre_facts", externalId: "service:svc1", serviceId: "svc1",
      category: "centre", tier: "general", state: "Victoria", externalUrl: "/services/svc1?tab=overview&sub=about",
    });
  });

  it("no-ops for a missing service", async () => {
    prismaMock.service.findUnique.mockResolvedValue(null);
    expect(await syncCentreFacts("nope")).toBeNull();
  });
});
