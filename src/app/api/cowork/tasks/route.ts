import { NextRequest } from "next/server";
import { POST as todosPost, GET as todosGet } from "../todos/route";

/**
 * /api/cowork/tasks — Thin alias for /api/cowork/todos
 *
 * Some Cowork automations reference "tasks" instead of "todos".
 * This endpoint re-exports the same handlers to avoid 404s.
 */
export async function POST(req: NextRequest) {
  return todosPost(req);
}

export async function GET(req: NextRequest) {
  return todosGet(req);
}
