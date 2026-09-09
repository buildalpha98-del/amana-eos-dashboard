import { describe, it, expect } from "vitest";
import type { Session } from "next-auth";
import {
  privateTodoWhere,
  privateTodoWhereFor,
} from "@/lib/todos/private-filter";

function sessionFor(role: string, id = "u1"): Session {
  return { user: { id, role, name: "T", email: "t@t.com" } } as unknown as Session;
}

describe("privateTodoWhereFor", () => {
  it.each(["owner", "head_office", "admin"])(
    "returns no clause for admin-tier role %s",
    (role) => {
      expect(privateTodoWhereFor(role, "u1")).toEqual({});
    },
  );

  it.each(["member", "staff", "marketing", "eos", "eos_viewer", "eos_implementer"])(
    "restricts private todos for role %s to assignee/co-assignee/creator",
    (role) => {
      expect(privateTodoWhereFor(role, "u1")).toEqual({
        OR: [
          { isPrivate: false },
          { assigneeId: "u1" },
          { assignees: { some: { userId: "u1" } } },
          { createdById: "u1" },
        ],
      });
    },
  );

  it("treats a missing role as restricted", () => {
    expect(privateTodoWhereFor(undefined, "u1")).not.toEqual({});
  });
});

describe("privateTodoWhere (session form)", () => {
  it("delegates using the session's role and user id", () => {
    expect(privateTodoWhere(sessionFor("member", "u42"))).toEqual(
      privateTodoWhereFor("member", "u42"),
    );
    expect(privateTodoWhere(sessionFor("owner"))).toEqual({});
  });
});
