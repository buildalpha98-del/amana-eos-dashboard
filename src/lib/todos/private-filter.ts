import type { Prisma } from "@prisma/client";
import type { Session } from "next-auth";

const PRIVATE_EXEMPT_ROLES = new Set(["owner", "head_office", "admin"]);

/**
 * Visibility clause for private todos. Private todos are visible only to
 * the primary assignee, any co-assignee, the creator, and admin-tier
 * roles. AND-compose this into EVERY session-scoped todo read query —
 * never hand-roll it per route.
 *
 * 2026-08-31: before this helper existed, `isPrivate` was display-only —
 * every read surface returned private todos to anyone in scope.
 */
export function privateTodoWhereFor(
  role: string | null | undefined,
  userId: string,
): Prisma.TodoWhereInput {
  if (role && PRIVATE_EXEMPT_ROLES.has(role)) return {};
  return {
    OR: [
      { isPrivate: false },
      { assigneeId: userId },
      { assignees: { some: { userId } } },
      { createdById: userId },
    ],
  };
}

/** Session convenience form of {@link privateTodoWhereFor}. */
export function privateTodoWhere(session: Session): Prisma.TodoWhereInput {
  return privateTodoWhereFor(
    (session.user.role as string) ?? undefined,
    session.user.id as string,
  );
}

/**
 * Imperative check for single-row reads: may this session user see this
 * (possibly private) todo? Mirrors {@link privateTodoWhereFor}.
 */
export function canViewTodo(
  session: Session,
  todo: {
    isPrivate: boolean;
    assigneeId: string | null;
    createdById: string | null;
    assignees?: Array<{ userId: string }>;
  },
): boolean {
  if (!todo.isPrivate) return true;
  const role = (session.user.role as string) ?? "";
  if (PRIVATE_EXEMPT_ROLES.has(role)) return true;
  const userId = session.user.id as string;
  return (
    todo.assigneeId === userId ||
    todo.createdById === userId ||
    (todo.assignees ?? []).some((a) => a.userId === userId)
  );
}
