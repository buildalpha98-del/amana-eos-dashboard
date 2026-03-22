import { NextRequest } from "next/server";
import { POST as todosPost, GET as todosGet } from "../todos/route";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/cowork/tasks — Thin alias for /api/cowork/todos
 *
 * Some Cowork automations reference "tasks" instead of "todos".
 * This endpoint re-exports the same handlers to avoid 404s.
 */
export const POST = withApiHandler(async (req) => {
  return todosPost(req);
});

export const GET = withApiHandler(async (req) => {
  return todosGet(req);
});
