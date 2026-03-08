/**
 * Fuzzy matcher — maps uploaded filenames to existing AuditTemplate names.
 * Uses normalized word overlap (Jaccard similarity) + substring containment.
 */

export interface MatchCandidate {
  id: string;
  name: string;
}

export interface MatchResult {
  filename: string;
  templateId: string | null;
  templateName: string | null;
  confidence: number;
}

const CONFIDENCE_THRESHOLD = 0.6;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function normalize(s: string): string {
  return s
    .replace(/\.(docx?|pdf|txt)$/i, "") // strip extension
    .replace(/[-_]+/g, " ") // hyphens/underscores → spaces
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase split
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // strip non-alphanumeric
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): Set<string> {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "of", "in", "for", "to", "is",
    "are", "was", "with", "on", "at", "by", "from", "audit", "checklist",
    "template", "form", "review", "inspection",
  ]);
  return new Set(
    s.split(" ").filter((w) => w.length > 1 && !stopWords.has(w))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function substringBonus(normalizedFilename: string, normalizedTemplate: string): number {
  // Full containment
  if (normalizedFilename.includes(normalizedTemplate)) return 0.3;
  if (normalizedTemplate.includes(normalizedFilename)) return 0.2;

  // Check for key phrase overlap (2+ consecutive word match)
  const fWords = normalizedFilename.split(" ");
  const tWords = normalizedTemplate.split(" ");
  for (let i = 0; i < fWords.length - 1; i++) {
    const bigram = `${fWords[i]} ${fWords[i + 1]}`;
    if (normalizedTemplate.includes(bigram)) return 0.15;
  }
  for (let i = 0; i < tWords.length - 1; i++) {
    const bigram = `${tWords[i]} ${tWords[i + 1]}`;
    if (normalizedFilename.includes(bigram)) return 0.15;
  }

  return 0;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function matchTemplates(
  filenames: string[],
  templates: MatchCandidate[]
): MatchResult[] {
  const normalizedTemplates = templates.map((t) => ({
    ...t,
    normalized: normalize(t.name),
    tokens: tokenize(normalize(t.name)),
  }));

  return filenames.map((filename) => {
    const normalizedFile = normalize(filename);
    const fileTokens = tokenize(normalizedFile);

    let bestMatch: {
      templateId: string;
      templateName: string;
      confidence: number;
    } | null = null;

    for (const t of normalizedTemplates) {
      const jaccard = jaccardSimilarity(fileTokens, t.tokens);
      const bonus = substringBonus(normalizedFile, t.normalized);
      const confidence = Math.min(jaccard + bonus, 1.0);

      if (confidence > (bestMatch?.confidence ?? 0)) {
        bestMatch = {
          templateId: t.id,
          templateName: t.name,
          confidence: Math.round(confidence * 100) / 100,
        };
      }
    }

    if (bestMatch && bestMatch.confidence >= CONFIDENCE_THRESHOLD) {
      return { filename, ...bestMatch };
    }

    return {
      filename,
      templateId: null,
      templateName: null,
      confidence: bestMatch?.confidence ?? 0,
    };
  });
}
