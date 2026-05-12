/**
 * Pure parser for the AI draft JSON response the `todos/draft-from-description`
 * template returns. Lifted out of CreateTodoModal so it's unit-testable
 * — the modal is a client component with Dialog + react-hook-form
 * dependencies that make it painful to mount in isolation, but the
 * parser is the only piece that can drift if the prompt template
 * changes.
 *
 * 2026-05-12: introduced (Bucket M — AI Draft in To-Do creation).
 */

export interface AiDraftSuggestion {
  title: string;
  description: string;
}

/**
 * Strip optional ```json … ``` fences a model sometimes emits, then
 * JSON.parse. Returns null when the result is missing `title` or
 * `description`, or when parsing fails entirely.
 */
export function parseAiDraft(raw: string): AiDraftSuggestion | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<AiDraftSuggestion>;
    if (
      typeof parsed.title === "string" &&
      typeof parsed.description === "string"
    ) {
      return { title: parsed.title, description: parsed.description };
    }
    return null;
  } catch {
    return null;
  }
}
