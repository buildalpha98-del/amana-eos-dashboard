import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { saveDraft, type TaskContext } from "@/lib/ai-task-agent";
import { createTestUser } from "@/lib/test-utils";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
let userId: string;
let todoId: string;
const source = (): TaskContext => ({ sourceType: "todo", sourceId: todoId, title: "Synthetic usage regression" });

beforeAll(async () => {
  const database = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.endsWith("_test")) throw new Error("Requires an isolated local test database");
  userId = (await createTestUser("owner")).user.id;
  todoId = (await prisma.todo.create({ data: { title: "Synthetic usage regression", createdById: userId, assigneeId: userId, dueDate: new Date("2026-10-12"), weekOf: new Date("2026-10-12") } })).id;
});

afterAll(async () => {
  if (todoId) await prisma.todo.deleteMany({ where: { id: todoId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

describe("task agent usage foreign key against PostgreSQL", () => {
  it("persists usage with a real user FK and identifiable automation metadata", async () => {
    const id = await saveDraft(source(), "Synthetic draft", 100, userId);
    const rows = await prisma.aiUsage.findMany({ where: { userId, section: "agent" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ automated: true, draftId: id, cron: "ai-task-agent" });
    expect(await prisma.aiTaskDraft.findUnique({ where: { id } })).toMatchObject({ content: "Synthetic draft" });
  });

  it("saves an unaccounted draft safely when no real account is available", async () => {
    const before = await prisma.aiUsage.count({ where: { userId } });
    const id = await saveDraft(source(), "No accounting user", 100, null);
    expect(await prisma.aiTaskDraft.findUnique({ where: { id } })).not.toBeNull();
    expect(await prisma.aiUsage.count({ where: { userId } })).toBe(before);
  });

  it("retains the draft if the accounting account was removed during the batch", async () => {
    const id = await saveDraft(source(), "Deleted accounting user", 100, "missing-account-for-regression");
    expect(await prisma.aiTaskDraft.findUnique({ where: { id } })).not.toBeNull();
    expect(await prisma.aiUsage.count({ where: { userId: "missing-account-for-regression" } })).toBe(0);
  });
});
