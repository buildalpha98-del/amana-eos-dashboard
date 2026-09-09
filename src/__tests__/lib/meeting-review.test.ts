import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const generateStructured = vi.fn();
vi.mock("@/lib/ai-provider", () => ({
  generateStructured: (args: unknown) => generateStructured(args),
}));

import {
  coalesceForPrompt,
  generateMeetingReview,
  TranscriptMissingError,
} from "@/lib/meeting-review";

const baseRecording = {
  id: "rec-1",
  transcript: [
    { speaker: 0, start: 0, end: 2, text: "Welcome everyone." },
    { speaker: 1, start: 2, end: 4, text: "Thanks Daniel." },
  ],
  meeting: {
    id: "m-1",
    title: "Leadership L10",
    date: new Date("2026-08-31T09:00:00Z"),
    isLeadership: true,
    serviceIds: [] as string[],
    attendees: [
      { userId: "u1", user: { id: "u1", name: "Daniel" } },
      { userId: "u2", user: { id: "u2", name: "Tracie" } },
    ],
  },
};

const modelResult = (overrides: Record<string, unknown> = {}) => ({
  data: {
    summary: "A productive meeting.",
    decisions: [{ text: "Ship it", quote: "let's ship it" }],
    actionItems: [
      {
        title: "Email the families",
        suggestedAssigneeUserId: "u2",
        suggestedAssigneeName: "Tracie",
        suggestedDueDate: "2026-09-04",
        quote: "Tracie will email the families by Friday",
      },
      {
        title: "Hallucinated owner",
        suggestedAssigneeUserId: "u-not-here",
        suggestedAssigneeName: "Ghost",
        suggestedDueDate: null,
        quote: "someone should do this",
      },
    ],
    missedItems: [
      {
        kind: "unowned_commitment",
        text: "Someone to call the council",
        quote: "we should call the council",
      },
    ],
    speakerMap: [
      { speaker: 0, name: "Daniel", confidence: "high" },
      { speaker: 1, name: null, confidence: "low" },
    ],
    ...overrides,
  },
  provider: "anthropic",
  modelId: "claude-sonnet-test",
  inputTokens: 1000,
  outputTokens: 500,
  costUsd: 0.01,
});

describe("generateMeetingReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.meetingRecording.findUnique.mockResolvedValue(baseRecording);
    prismaMock.issue.findMany.mockResolvedValue([{ id: "i1", title: "Bus late" }]);
    prismaMock.rock.findMany.mockResolvedValue([
      { id: "r1", title: "Grow occupancy", status: "on_track" },
    ]);
    prismaMock.todo.findMany.mockResolvedValue([
      { title: "Order supplies", assignee: { name: "Tracie" } },
    ]);
    generateStructured.mockResolvedValue(modelResult());
  });

  it("throws TranscriptMissingError when the transcript is empty", async () => {
    prismaMock.meetingRecording.findUnique.mockResolvedValue({
      ...baseRecording,
      transcript: [],
    });
    await expect(generateMeetingReview("rec-1")).rejects.toThrow(
      TranscriptMissingError,
    );
  });

  it("nulls hallucinated assignee ids and mints ids + proposed statuses", async () => {
    const review = await generateMeetingReview("rec-1");

    expect(review.actionItems).toHaveLength(2);
    const [real, ghost] = review.actionItems;
    expect(real.suggestedAssigneeUserId).toBe("u2");
    expect(ghost.suggestedAssigneeUserId).toBeNull();
    for (const item of review.actionItems) {
      expect(item.id).toMatch(/[0-9a-f-]{36}/);
      expect(item.status).toBe("proposed");
    }
    expect(review.missedItems[0].status).toBe("proposed");
    expect(review.modelId).toBe("claude-sonnet-test");
    expect(typeof review.generatedAt).toBe("string");
  });

  it("caps action items at 20 and missed items at 10", async () => {
    generateStructured.mockResolvedValue(
      modelResult({
        actionItems: Array.from({ length: 30 }, (_, i) => ({
          title: `Item ${i}`,
          suggestedAssigneeUserId: null,
          suggestedAssigneeName: null,
          suggestedDueDate: null,
          quote: "q",
        })),
        missedItems: Array.from({ length: 15 }, () => ({
          kind: "unowned_commitment",
          text: "t",
          quote: "q",
        })),
      }),
    );
    const review = await generateMeetingReview("rec-1");
    expect(review.actionItems).toHaveLength(20);
    expect(review.missedItems).toHaveLength(10);
  });

  it("feeds attendees, open issues and existing todos into the prompt context", async () => {
    await generateMeetingReview("rec-1");
    const arg = generateStructured.mock.calls[0][0] as { prompt: string };
    expect(arg.prompt).toContain("Daniel");
    expect(arg.prompt).toContain("Bus late");
    expect(arg.prompt).toContain("Order supplies");
    expect(arg.prompt).toContain("Speaker 0: Welcome everyone.");
  });
});

describe("coalesceForPrompt", () => {
  it("coalesces same-speaker runs", () => {
    expect(
      coalesceForPrompt([
        { speaker: 0, start: 0, end: 1, text: "a." },
        { speaker: 0, start: 1, end: 2, text: "b." },
        { speaker: 1, start: 2, end: 3, text: "c." },
      ]),
    ).toBe("Speaker 0: a. b.\nSpeaker 1: c.");
  });

  it("truncates oldest-first past the budget, keeping the tail", () => {
    const utterances = Array.from({ length: 4000 }, (_, i) => ({
      speaker: i % 2,
      start: i,
      end: i + 1,
      text: `utterance number ${i} ${"x".repeat(60)}`,
    }));
    const text = coalesceForPrompt(utterances);
    expect(text.length).toBeLessThanOrEqual(150_000 + 50);
    expect(text.startsWith("[…earlier discussion truncated…]")).toBe(true);
    expect(text).toContain("utterance number 3999");
  });
});
