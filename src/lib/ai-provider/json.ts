/**
 * Best-effort JSON extraction from an LLM response.
 *
 * Models occasionally wrap JSON in markdown fences or add prose preamble,
 * even when instructed otherwise. This helper finds the first balanced
 * `{...}` or `[...]` block and parses it.
 */
export function extractJson(text: string): unknown {
  if (!text) return null;
  const trimmed = text.trim();

  // Direct parse attempt
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to fence/balance extraction
  }

  // Markdown code-fence variant: ```json ... ``` or ``` ... ```
  const fence = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // fall through
    }
  }

  // First balanced object — naïve scan that respects strings + escapes
  const braceJson = extractFirstBalanced(trimmed, "{", "}");
  if (braceJson) {
    try {
      return JSON.parse(braceJson);
    } catch {
      // fall through
    }
  }

  const bracketJson = extractFirstBalanced(trimmed, "[", "]");
  if (bracketJson) {
    try {
      return JSON.parse(bracketJson);
    } catch {
      // fall through
    }
  }

  return null;
}

function extractFirstBalanced(s: string, open: string, close: string): string | null {
  const start = s.indexOf(open);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}
