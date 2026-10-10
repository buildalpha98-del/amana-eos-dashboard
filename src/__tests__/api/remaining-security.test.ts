import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { privateTodoWhereFor } from "@/lib/todos/private-filter";
import * as rock from "@/app/api/rocks/[id]/route";
import * as rocks from "@/app/api/rocks/route";
import * as issue from "@/app/api/issues/[id]/route";
import * as issues from "@/app/api/issues/route";
import * as issueBulk from "@/app/api/issues/bulk/route";
import * as todo from "@/app/api/todos/[id]/route";
import * as todos from "@/app/api/todos/route";
import * as todoBulk from "@/app/api/todos/bulk-actions/route";
import * as milestone from "@/app/api/milestones/[id]/route";
import * as milestones from "@/app/api/rocks/[id]/milestones/route";
import * as entries from "@/app/api/measurables/[id]/entries/route";
import * as reorder from "@/app/api/measurables/reorder/route";
import * as project from "@/app/api/projects/[id]/route";
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));
const user = { id: "viewer", name: "Viewer", role: "eos_viewer" as const };
const ctx = { params: Promise.resolve({ id: "target" }) };
beforeEach(() => {
  vi.clearAllMocks(); _clearUserActiveCache(); mockSession(user);
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("EOS read-only accounts cannot mutate through APIs", () => {
  const writes = [
    ["PATCH", "/rocks/target", rock.PATCH], ["DELETE", "/rocks/target", rock.DELETE],
    ["POST", "/rocks", rocks.POST], ["POST", "/rocks/target/milestones", milestones.POST],
    ["PATCH", "/milestones/target", milestone.PATCH], ["DELETE", "/milestones/target", milestone.DELETE],
    ["POST", "/issues", issues.POST], ["PATCH", "/issues/target", issue.PATCH],
    ["DELETE", "/issues/target", issue.DELETE], ["POST", "/issues/bulk", issueBulk.POST],
    ["POST", "/todos", todos.POST], ["PATCH", "/todos/target", todo.PATCH],
    ["DELETE", "/todos/target", todo.DELETE], ["POST", "/todos/bulk-actions", todoBulk.POST],
    ["POST", "/measurables/target/entries", entries.POST], ["DELETE", "/measurables/target/entries", entries.DELETE],
    ["PUT", "/measurables/reorder", reorder.PUT],
  ] as const;
  it.each(writes)("denies %s %s before a write", async (method, path, handler) => {
    const response = await handler(createRequest(method, `/api${path}`, { body: {} }), ctx);
    expect(response.status).toBe(403);
    for (const model of ["rock", "issue", "todo", "milestone", "measurableEntry"]) {
      for (const operation of ["create", "update", "updateMany", "delete", "deleteMany"]) {
        expect(prismaMock[model][operation]).not.toHaveBeenCalled();
      }
    }
  });
  it("keeps reads available to an EOS viewer", async () => {
    prismaMock.rock.findUnique.mockResolvedValue({ id: "target", todos: [] });
    expect((await rock.GET(createRequest("GET", "/api/rocks/target"), ctx)).status).toBe(200);
  });
});

describe("private ToDos across nested reads and bulk writes", () => {
  const privacy = privateTodoWhereFor("eos_implementer", user.id);
  beforeEach(() => mockSession({ ...user, role: "eos_implementer" }));
  it.each([
    ["rock", rock.GET, "todos"], ["issue", issue.GET, "spawnedTodos"], ["project", project.GET, "todos"],
  ] as const)("filters private ToDos on %s detail", async (model, handler, relation) => {
    prismaMock[model].findUnique.mockResolvedValue({ id: "target", [relation]: [] });
    const response = await handler(createRequest("GET", `/api/${model}s/target`), ctx);
    expect(response.status).toBe(200);
    expect(prismaMock[model].findUnique.mock.calls[0][0].include[relation].where).toEqual({ deleted: false, AND: [privacy] });
  });
  it("returns 404 and does not delete another user's private ToDo", async () => {
    prismaMock.todo.findUnique.mockResolvedValue({ id: "target", isPrivate: true, assigneeId: "other", createdById: "other", assignees: [] });
    expect((await todo.DELETE(createRequest("DELETE", "/api/todos/target"), ctx)).status).toBe(404);
    expect(prismaMock.todo.update).not.toHaveBeenCalled();
    expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
  });
  it.each(["complete", "delete", "assign"])("restricts bulk %s selection and mutation", async action => {
    prismaMock.todo.findMany.mockResolvedValue([{ id: "visible", rockId: null }]);
    prismaMock.todo.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findFirst.mockResolvedValue({ id: "assignee", active: true });
    const response = await todoBulk.POST(createRequest("POST", "/api/todos/bulk-actions", { body: { action, ids: ["visible", "hidden"], assigneeId: "assignee" } }));
    expect(response.status).toBe(200);
    expect(prismaMock.todo.findMany.mock.calls[0][0].where.AND).toEqual([privacy]);
    expect(prismaMock.todo.updateMany.mock.calls[0][0].where).toEqual({ id: { in: ["visible"] }, deleted: false, AND: [privacy] });
  });
  it("preserves members' completion workflow but denies bulk deletion", async () => {
    mockSession({ ...user, role: "member" });
    prismaMock.todo.findMany.mockResolvedValue([{ id: "visible", rockId: null }]);
    prismaMock.todo.updateMany.mockResolvedValue({ count: 1 });
    expect((await todoBulk.POST(createRequest("POST", "/api/todos/bulk-actions", { body: { action: "complete", ids: ["visible"] } }))).status).toBe(200);
    expect((await todoBulk.POST(createRequest("POST", "/api/todos/bulk-actions", { body: { action: "delete", ids: ["visible"] } }))).status).toBe(403);
  });
});
