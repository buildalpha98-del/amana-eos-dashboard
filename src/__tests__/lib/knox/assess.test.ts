import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ComplaintRecord, IncidentRecord, StaffIncidentReport } from "@prisma/client";

vi.mock("@/lib/ai-provider", () => ({
  generateStructured: vi.fn(),
  DEFAULT_PROVIDER_MODEL: {
    showcase: { provider: "anthropic", modelId: "claude-showcase" },
    bulk: { provider: "groq", modelId: "llama-bulk" },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { generateStructured } from "@/lib/ai-provider";
import { logger } from "@/lib/logger";
import {
  assessmentSchema,
  assessWithModel,
  redactForModel,
  MISSING_FIELD_LABELS,
} from "@/lib/knox/assess";
import { buildAssessmentPrompt, KNOX_SYSTEM_PROMPT } from "@/lib/knox/prompt";
import type { RulesResult } from "@/lib/knox/types";

const mockedGenerate = vi.mocked(generateStructured);

const svc = { id: "svc-1", name: "Arkana", state: "NSW", managerId: null };

const incident = (o: Partial<IncidentRecord> = {}) => ({
  type: "incident" as const,
  service: svc,
  childFirstName: "Ali",
  record: {
    id: "i1",
    serviceId: "svc-1",
    incidentDate: new Date("2026-10-20T01:00:00Z"),
    incidentType: "injury",
    severity: "minor",
    description: "Fell from the climbing frame and hurt his wrist",
    ambulanceCalled: false,
    medicalPersonnelContacted: null,
    reportableToAuthority: false,
    seriousIncidentCategory: null,
    parentNotified: false,
    becameAwareAt: null,
    ...o,
  } as IncidentRecord,
});

const complaint = (o: Partial<ComplaintRecord> = {}) => ({
  type: "complaint" as const,
  service: svc,
  record: {
    id: "c1",
    serviceId: "svc-1",
    category: "child_safety",
    summary: "Parent says her son was left unsupervised",
    notifiable: true,
    complainantName: "Fatima Khan",
    complainantEmail: "fatima.khan@example.com",
    complainantPhone: "0411222333",
    childName: "Omar Khan",
    ...o,
  } as ComplaintRecord,
});

const staffIncident = (o: Partial<StaffIncidentReport> = {}) => ({
  type: "staff_incident" as const,
  service: svc,
  record: {
    id: "s1",
    serviceId: "svc-1",
    staffName: "Mariam Yousef",
    severity: "moderate",
    description: "Slipped on a wet floor in the kitchen",
    witnessNames: "Hassan Ibrahim, Layla Noor",
    ...o,
  } as StaffIncidentReport,
});

const rules: RulesResult = { tier: "moderate", ruleHits: ["medical_contacted"], clocks: [] };

const validAssessment = {
  severityOpinion: "understated" as const,
  rationale: "Head injury with no GP contact recorded.",
  missingFields: ["circumstances", "witnesses"] as const,
  suggestedSeverity: "serious" as const,
  suggestedCategory: "serious_injury" as const,
  followUpTodos: [{ title: "Call the family tonight", dueInDays: 1 as const }],
  parentNoticeDraft: "Dear parent, {{child_name}} had a fall today.",
};

beforeEach(() => {
  mockedGenerate.mockReset();
  vi.mocked(logger.warn).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("redactForModel", () => {
  it("drops the child surname and replaces witness names, keeping the first name", () => {
    const s = incident({ childName: "Ali Haddad", witnesses: "Seen by Sarah Lee and a parent" });
    const text = JSON.stringify(redactForModel(s));
    expect(text).not.toMatch(/Haddad|Sarah|Lee/);
    expect(text).toContain("Ali");
    expect(text).toContain("[name]");
  });

  it("drops incident-only identifiers and scrubs the surname from free text", () => {
    const s = incident({
      childName: "Ali Haddad",
      parentNotifiedName: "Nadia Haddad",
      recordedSignature: "Joe Bloggs",
      firstAidBy: "Casual Cathy",
      description: "Haddad slipped on the stairs",
    });
    const text = JSON.stringify(redactForModel(s));
    expect(text).not.toMatch(/Haddad|Nadia|Bloggs|Cathy/);
  });

  it("keeps the facts the model needs to judge severity", () => {
    const s = incident({
      ambulanceCalled: true,
      medicalPersonnelContacted: "GP phoned",
      firstAidGiven: true,
      firstAidDetails: "Ice pack",
      circumstances: "Playing tag",
      actionTaken: "Sat out",
    });
    const redacted = redactForModel(s);
    expect(redacted).toMatchObject({
      type: "incident",
      severity: "minor",
      ambulanceCalled: true,
      medicalPersonnelContacted: "GP phoned",
      firstAidDetails: "Ice pack",
      circumstances: "Playing tag",
      actionTaken: "Sat out",
      service: { name: "Arkana", state: "NSW" },
    });
  });

  it("strips complainant identity and reduces the child to a first name", () => {
    const text = JSON.stringify(redactForModel(complaint({ details: "Fatima Khan rang about Omar Khan" })));
    expect(text).not.toMatch(/Fatima|Khan|example\.com|0411222333/);
    expect(text).toContain("Omar");
  });

  it("keeps only the staff first name and heuristically redacts witnesses", () => {
    const text = JSON.stringify(redactForModel(staffIncident()));
    expect(text).not.toMatch(/Yousef|Ibrahim|Hassan|Layla|Noor/);
    expect(text).toContain("Mariam");
  });
});

describe("buildAssessmentPrompt", () => {
  it("never carries surname, email or phone, and passes the rules result verbatim", () => {
    const prompt = buildAssessmentPrompt(redactForModel(complaint()), rules);
    expect(prompt).not.toMatch(/Khan|fatima|example\.com|0411222333/i);
    expect(prompt).toContain("medical_contacted");
    expect(prompt).toContain('"tier"');
  });
});

describe("KNOX_SYSTEM_PROMPT", () => {
  it("states the contract the worker relies on", () => {
    for (const phrase of [
      "Australian English",
      "Reg 86",
      "Reg 87",
      "Reg 175",
      "Reg 176",
      "s.174",
      "critique the rules result, do not recompute it",
      "never propose a lower severity",
      "{{child_name}}",
      "JSON only",
    ]) {
      expect(KNOX_SYSTEM_PROMPT).toContain(phrase);
    }
  });
});

describe("assessmentSchema", () => {
  it("accepts a valid assessment", () => {
    expect(assessmentSchema.safeParse(validAssessment).success).toBe(true);
  });

  it("rejects an unknown suggestedCategory and a 5th todo", () => {
    expect(assessmentSchema.safeParse({ ...validAssessment, suggestedCategory: "bee_sting" }).success).toBe(false);
    const todos = Array.from({ length: 5 }, (_, i) => ({ title: `Follow up ${i}`, dueInDays: 3 as const }));
    expect(assessmentSchema.safeParse({ ...validAssessment, followUpTodos: todos }).success).toBe(false);
  });

  it("rejects bad enums and over-long fields", () => {
    expect(assessmentSchema.safeParse({ ...validAssessment, severityOpinion: "maybe" }).success).toBe(false);
    expect(assessmentSchema.safeParse({ ...validAssessment, suggestedSeverity: "minor" }).success).toBe(false);
    expect(assessmentSchema.safeParse({ ...validAssessment, rationale: "" }).success).toBe(false);
    expect(assessmentSchema.safeParse({ ...validAssessment, rationale: "x".repeat(601) }).success).toBe(false);
    expect(assessmentSchema.safeParse({ ...validAssessment, missingFields: ["shoe_size"] }).success).toBe(false);
    expect(
      assessmentSchema.safeParse({ ...validAssessment, followUpTodos: [{ title: "Call the family", dueInDays: 2 }] }).success,
    ).toBe(false);
    expect(assessmentSchema.safeParse({ ...validAssessment, parentNoticeDraft: "x".repeat(2001) }).success).toBe(false);
    expect(assessmentSchema.safeParse({ ...validAssessment, regulatorPackDraft: "x".repeat(6001) }).success).toBe(false);
  });

  it("exposes the fixed missing-field tuple", () => {
    expect([...MISSING_FIELD_LABELS]).toEqual([
      "circumstances",
      "actionTaken",
      "firstAidDetails",
      "witnesses",
      "parentNotifiedName",
      "parentNotifiedMethod",
      "becameAwareAt",
      "seriousIncidentCategory",
      "location",
      "timeOfDay",
    ]);
  });
});

describe("assessWithModel", () => {
  it("returns ok with parsed data, model id and token counts", async () => {
    mockedGenerate.mockImplementation(async () => ({
      data: validAssessment,
      provider: "anthropic",
      modelId: "claude-showcase",
      inputTokens: 321,
      outputTokens: 123,
      costUsd: 0.01,
    }));

    const result = await assessWithModel(incident({ childName: "Ali Haddad" }), rules);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual(validAssessment);
    expect(result.modelId).toBe("claude-showcase");
    expect(result.inputTokens).toBe(321);
    expect(result.outputTokens).toBe(123);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const args = mockedGenerate.mock.calls[0][0];
    expect(args.system).toBe(KNOX_SYSTEM_PROMPT);
    expect(args.schema).toBe(assessmentSchema);
    expect(args.maxTokens).toBe(1500);
    expect(args.temperature).toBe(0.2);
    expect(args.providerModel).toBeUndefined();
    expect(args.prompt).not.toContain("Haddad");
    expect(args.prompt).toContain("Ali");
  });

  it("returns ok:false on a timeout and leaves no timer behind", async () => {
    vi.useFakeTimers();
    mockedGenerate.mockImplementation(() => new Promise(() => {}));

    const pending = assessWithModel(incident(), rules, { timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    const result = await pending;

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/timed out/i) });
    expect(vi.getTimerCount()).toBe(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("clears its timer after a successful call", async () => {
    vi.useFakeTimers();
    mockedGenerate.mockImplementation(async () => ({
      data: validAssessment,
      provider: "anthropic",
      modelId: "claude-showcase",
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
    }));

    const result = await assessWithModel(incident(), rules);

    expect(result.ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns ok:false when the provider rejects", async () => {
    vi.useFakeTimers();
    mockedGenerate.mockImplementation(async () => {
      throw new Error("ANTHROPIC_API_KEY is not set");
    });

    const result = await assessWithModel(incident(), rules);

    expect(result).toEqual({ ok: false, error: "ANTHROPIC_API_KEY is not set" });
    expect(vi.getTimerCount()).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith("Knox model assessment failed", expect.any(Object));
  });
});
