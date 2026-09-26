import { redirect } from "next/navigation";

/**
 * /knowledge was a standalone Q&A page backed by the legacy
 * Document/DocumentChunk store (/api/knowledge/ask + /api/knowledge/status),
 * which Task 20 (2026-09-27) retired. The same Q&A capability now runs over
 * the new src/lib/knowledge/* store via the search_knowledge assistant tool,
 * available everywhere through the floating Ask-Amana-AI pill and the
 * dedicated /assistant page (already granted to every role that had
 * /knowledge). Kept as a redirect — not a hard delete — so the nav item and
 * any bookmarks keep working, matching the /recruitment → /hiring pattern.
 */
export default function KnowledgeRedirect() {
  redirect("/assistant");
}
