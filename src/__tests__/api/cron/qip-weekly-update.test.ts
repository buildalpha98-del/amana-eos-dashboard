import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { createRequest } from "../../helpers/request";

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});
vi.mock("@/lib/ai", () => ({
  generateText: vi.fn(),
  getAI: vi.fn(() => ({})),
}));
vi.mock("@/lib/notifications/sendEmail", () => ({
  sendNotificationEmail: vi.fn(() => Promise.resolve()),
}));

import { generateText } from "@/lib/ai";
import { sendNotificationEmail } from "@/lib/notifications/sendEmail";

const ORIGINAL_ENV = { ...process.env };

const TAG_TEMPLATE = {
  slug: "nqs/tag-content",
  model: "claude-haiku-4-5-20251001",
  maxTokens: 1024,
  promptTemplate: "Tag these:\n{{items}}",
};
const UPDATE_TEMPLATE = {
  slug: "compliance/qip-weekly-update",
  model: "claude-sonnet-4-20250514",
  maxTokens: 1500,
  promptTemplate:
    "QA {{qualityArea}} {{qualityAreaName}} of {{documentType}}\nCURRENT:{{currentFields}}\nEVIDENCE:{{evidence}}\nPENDING:{{pendingProposals}}",
};

function primeBase() {
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.ANTHROPIC_API_KEY = "test-key";

  prismaMock.cronRun.findUnique.mockResolvedValue(null);
  prismaMock.cronRun.create.mockResolvedValue({ id: "run-1", status: "running" });
  prismaMock.cronRun.update.mockResolvedValue({});

  prismaMock.aiPromptTemplate.findUnique.mockImplementation(({ where }: any) =>
    Promise.resolve(
      where.slug === "nqs/tag-content"
        ? TAG_TEMPLATE
        : where.slug === "compliance/qip-weekly-update"
          ? UPDATE_TEMPLATE
          : null,
    ),
  );

  // no cache hits by default
  prismaMock.aiGenerationCache.findUnique.mockResolvedValue(null);
  prismaMock.aiGenerationCache.upsert.mockResolvedValue({});

  prismaMock.qualityImprovementPlan.findMany.mockResolvedValue([]);
  prismaMock.staffReflection.findMany.mockResolvedValue([]);
  prismaMock.staffReflection.update.mockResolvedValue({});
  prismaMock.learningObservation.findMany.mockResolvedValue([]);
  prismaMock.learningObservation.update.mockResolvedValue({});
  prismaMock.qipSuggestion.findMany.mockResolvedValue([]);
  prismaMock.qipSuggestion.create.mockResolvedValue({ id: "sg-new" });
  prismaMock.user.findMany.mockResolvedValue([]);
}

const QIP = {
  id: "q1",
  serviceId: "s1",
  documentType: "sat",
  service: { id: "s1", name: "Sunny OSHC", state: "NSW" },
  qualityAreas: [
    {
      id: "qa5",
      qualityArea: 5,
      qualityAreaName: "Relationships with Children",
      strengths: "Existing strengths text",
      areasForImprovement: null,
      progressNotes: null,
      evidenceCollected: null,
    },
  ],
};

const taggedReflection = {
  id: "r1",
  title: "Daily reflection",
  content: "We supported Aisha through a tricky peer conflict with restorative chat.",
  qualityAreas: [5],
  mtopOutcomes: ["Wellbeing"],
  createdAt: new Date("2026-07-08T05:00:00Z"),
  linkedObservationIds: [],
};

describe("/api/cron/qip-weekly-update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Friday 06:00 UTC = 4pm AEST
    vi.setSystemTime(new Date("2026-07-10T06:00:00Z"));
    primeBase();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...ORIGINAL_ENV };
  });

  it("401 without cron secret", async () => {
    const { GET } = await import("@/app/api/cron/qip-weekly-update/route");
    const res = await GET(createRequest("GET", "/api/cron/qip-weekly-update"));
    expect(res.status).toBe(401);
  });

  it("skips when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { GET } = await import("@/app/api/cron/qip-weekly-update/route");
    const res = await GET(
      createRequest("GET", "/api/cron/qip-weekly-update", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    const body = await res.json();
    expect(body.skipped).toBe(true);
  });

  it("skips when the lock is held", async () => {
    prismaMock.cronRun.findUnique.mockResolvedValue({ id: "old", status: "completed" });
    const { GET } = await import("@/app/api/cron/qip-weekly-update/route");
    const res = await GET(
      createRequest("GET", "/api/cron/qip-weekly-update", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect((await res.json()).skipped).toBe(true);
  });

  it("backfills tags on untagged content with aiTagged=true", async () => {
    prismaMock.qualityImprovementPlan.findMany.mockResolvedValue([QIP]);
    // Untagged reflection in phase 1; nothing tagged for phase 2
    prismaMock.staffReflection.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.qualityAreas?.isEmpty
          ? [{ id: "r-untagged", content: "We tidied the shed", createdAt: new Date() }]
          : [],
      ),
    );
    vi.mocked(generateText).mockResolvedValue(
      '{"items":[{"index":1,"qualityAreas":[3],"mtopOutcomes":[]}]}',
    );

    const { GET } = await import("@/app/api/cron/qip-weekly-update/route");
    const res = await GET(
      createRequest("GET", "/api/cron/qip-weekly-update", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.staffReflection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r-untagged" },
        data: expect.objectContaining({ qualityAreas: [3], aiTagged: true }),
      }),
    );
  });

  it("creates suggestions with evidence refs and notifies reviewers", async () => {
    prismaMock.qualityImprovementPlan.findMany.mockResolvedValue([QIP]);
    prismaMock.staffReflection.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where.qualityAreas?.isEmpty ? [] : [taggedReflection]),
    );
    vi.mocked(generateText).mockResolvedValue(
      '{"changes":[{"field":"strengths","proposedText":"Updated strengths incl. restorative practice.","rationale":"Evidence 1"}]}',
    );
    prismaMock.user.findMany.mockResolvedValue([
      { id: "dir1", name: "Dir", email: "dir@amana.test" },
    ]);

    const { GET } = await import("@/app/api/cron/qip-weekly-update/route");
    const res = await GET(
      createRequest("GET", "/api/cron/qip-weekly-update", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    const body = await res.json();
    expect(body.suggestionsCreated).toBe(1);

    expect(prismaMock.qipSuggestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          qipId: "q1",
          qualityArea: 5,
          field: "strengths",
          currentText: "Existing strengths text",
          proposedText: "Updated strengths incl. restorative practice.",
          evidenceRefs: expect.arrayContaining([
            expect.objectContaining({ type: "reflection", id: "r1" }),
          ]),
          // Monday 00:00 Sydney of the run week
          weekOf: new Date("2026-07-05T14:00:00.000Z"),
        }),
      }),
    );
    expect(sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "dir@amana.test", type: "qip_suggestions_ready" }),
    );
  });

  it("creates nothing when the AI returns no changes", async () => {
    prismaMock.qualityImprovementPlan.findMany.mockResolvedValue([QIP]);
    prismaMock.staffReflection.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where.qualityAreas?.isEmpty ? [] : [taggedReflection]),
    );
    vi.mocked(generateText).mockResolvedValue('{"changes":[]}');

    const { GET } = await import("@/app/api/cron/qip-weekly-update/route");
    const res = await GET(
      createRequest("GET", "/api/cron/qip-weekly-update", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    const body = await res.json();
    expect(body.suggestionsCreated).toBe(0);
    expect(prismaMock.qipSuggestion.create).not.toHaveBeenCalled();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("survives malformed AI output (skips, still succeeds)", async () => {
    prismaMock.qualityImprovementPlan.findMany.mockResolvedValue([QIP]);
    prismaMock.staffReflection.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where.qualityAreas?.isEmpty ? [] : [taggedReflection]),
    );
    vi.mocked(generateText).mockResolvedValue("SORRY I CANNOT DO JSON TODAY");

    const { GET } = await import("@/app/api/cron/qip-weekly-update/route");
    const res = await GET(
      createRequest("GET", "/api/cron/qip-weekly-update", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).suggestionsCreated).toBe(0);
    expect(prismaMock.qipSuggestion.create).not.toHaveBeenCalled();
  });

  it("uses the AiGenerationCache on hit (no model call)", async () => {
    prismaMock.qualityImprovementPlan.findMany.mockResolvedValue([QIP]);
    prismaMock.staffReflection.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where.qualityAreas?.isEmpty ? [] : [taggedReflection]),
    );
    prismaMock.aiGenerationCache.findUnique.mockResolvedValue({
      output: '{"changes":[]}',
      expiresAt: new Date("2026-08-01"),
    });

    const { GET } = await import("@/app/api/cron/qip-weekly-update/route");
    await GET(
      createRequest("GET", "/api/cron/qip-weekly-update", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(generateText).not.toHaveBeenCalled();
  });
});
