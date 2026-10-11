import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { saveDraft, type TaskContext } from "@/lib/ai-task-agent";
import { logger } from "@/lib/logger";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

const task: TaskContext = { sourceType: "todo", sourceId: "task-1", title: "Draft a checklist" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.aiTaskDraft.create.mockResolvedValue({ id: "draft-1" });
  prismaMock.aiUsage.create.mockResolvedValue({ id: "usage-1" });
});

describe("task agent usage accounting", () => {
  it("logs automated usage against the resolved real account", async () => {
    expect(await saveDraft(task, "Synthetic draft", 100, "owner-1")).toBe("draft-1");
    expect(prismaMock.aiUsage.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "owner-1", section: "agent", templateSlug: "agent/todo",
      inputTokens: 70, outputTokens: 30,
      metadata: { automated: true, cron: "ai-task-agent", draftId: "draft-1", sourceType: "todo", sourceId: "task-1" },
    }) });
  });

  it("keeps the draft without attempting an invalid usage insert when no account is available", async () => {
    expect(await saveDraft(task, "Synthetic draft", 100, null)).toBe("draft-1");
    expect(prismaMock.aiTaskDraft.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.aiUsage.create).not.toHaveBeenCalled();
  });

  it("retains the saved draft when usage insertion fails", async () => {
    const error = new Error("account deleted during the batch");
    prismaMock.aiUsage.create.mockRejectedValue(error);
    expect(await saveDraft(task, "Synthetic draft", 100, "deleted-owner")).toBe("draft-1");
    expect(logger.error).toHaveBeenCalledWith("Failed to log AI usage for task agent draft", expect.objectContaining({ err: error, draftId: "draft-1" }));
  });

  it("does not record successful usage when saving the draft fails", async () => {
    prismaMock.aiTaskDraft.create.mockRejectedValue(new Error("draft write failed"));
    await expect(saveDraft(task, "Synthetic draft", 100, "owner-1")).rejects.toThrow("draft write failed");
    expect(prismaMock.aiUsage.create).not.toHaveBeenCalled();
  });
});
