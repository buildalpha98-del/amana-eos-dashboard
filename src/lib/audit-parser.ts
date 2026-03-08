/**
 * Audit document parser — extracts checklist items from plain-text
 * converted .docx audit templates.
 *
 * Supports 4 structural patterns:
 *  1. YES / NO table           → yes_no
 *  2. Rating 1-5 table         → rating_1_5
 *  3. Compliant / Non-Compliant → compliant
 *  4. Date of Review            → review_date
 *
 * Special case: sections with "must answer NO" → reverse_yes_no
 */

export type AuditResponseFormat =
  | "yes_no"
  | "rating_1_5"
  | "compliant"
  | "reverse_yes_no"
  | "review_date"
  | "inventory";

export interface ParsedItem {
  section: string | null;
  question: string;
  guidance: string | null;
  responseFormat: AuditResponseFormat;
}

export interface ParsedAuditResult {
  detectedFormat: AuditResponseFormat;
  items: ParsedItem[];
  metadata: {
    totalItems: number;
    sections: string[];
    hasReverseYesNo: boolean;
  };
}

/* ------------------------------------------------------------------ */
/* Format detection                                                    */
/* ------------------------------------------------------------------ */

function detectFormat(text: string): {
  format: AuditResponseFormat;
  hasReverseYesNo: boolean;
} {
  const upper = text.toUpperCase();
  const hasReverseYesNo =
    /MUST\s+ANSWER\s+NO/i.test(text) || /ANSWER\s+NO/i.test(text);

  // Rating 1-5
  if (
    (upper.includes("RATING") && (upper.includes("(1-5)") || upper.includes("1-5"))) ||
    /RATING\s*[:.]?\s*[(\[]?1[\s-]+5/i.test(text)
  ) {
    return { format: "rating_1_5", hasReverseYesNo };
  }

  // Compliant / Non-Compliant
  if (upper.includes("COMPLIANT") && upper.includes("NON-COMPLIANT")) {
    return { format: "compliant", hasReverseYesNo };
  }

  // Date of Review
  if (upper.includes("DATE OF REVIEW") || upper.includes("REVIEW DATE")) {
    return { format: "review_date", hasReverseYesNo };
  }

  // Default
  return { format: "yes_no", hasReverseYesNo };
}

/* ------------------------------------------------------------------ */
/* Section header detection                                            */
/* ------------------------------------------------------------------ */

function isSectionHeader(line: string, nextLine: string | undefined): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 3) return false;
  if (trimmed.length > 120) return false;

  // Skip known non-section patterns
  if (/^\d+[.)]\s/.test(trimmed)) return false; // numbered items
  if (/^[-•●]\s/.test(trimmed)) return false; // bullet points
  if (/^(yes|no|na|n\/a|rating|compliant|non-compliant)$/i.test(trimmed)) return false;

  // Strong section indicators
  if (/^(SECTION|AREA|PART|CATEGORY)\s*\d*\s*[-:]/i.test(trimmed)) return true;
  if (/^QA\s*\d/i.test(trimmed)) return true;

  // ALL CAPS line that isn't too short
  if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && trimmed.length >= 5 && trimmed.length <= 80) {
    return true;
  }

  // Title case followed by a numbered list
  if (
    /^[A-Z][a-z]/.test(trimmed) &&
    !trimmed.includes("?") &&
    trimmed.length <= 80 &&
    nextLine &&
    /^\d+[.)]\s/.test(nextLine.trim())
  ) {
    return true;
  }

  // Line ending with colon (common section header pattern)
  if (trimmed.endsWith(":") && trimmed.length <= 60 && /^[A-Z]/.test(trimmed)) {
    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ */
/* Question extraction                                                 */
/* ------------------------------------------------------------------ */

function isQuestionLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 5) return false;

  // Numbered items: 1. / 1) / 1:
  if (/^\d+[.):\s]\s*.{5,}/.test(trimmed)) return true;

  // Lettered items: a. / a) / (a)
  if (/^[a-z][.)]\s*.{5,}/.test(trimmed)) return true;
  if (/^\([a-z]\)\s*.{5,}/.test(trimmed)) return true;

  // Bullet points
  if (/^[-•●◦▪]\s+.{5,}/.test(trimmed)) return true;

  // Lines that look like questions (contain question mark)
  if (trimmed.includes("?") && trimmed.length > 10) return true;

  // Lines starting with verbs common in audit items
  if (
    /^(Is|Are|Does|Do|Has|Have|Can|Will|Should|Ensure|Check|Verify|Confirm|Review|Assess|Inspect|Observe|Monitor|Record|Document|Maintain|Provide|Display|Store|Keep|Follow|Complete|Submit|Update|Report|Investigate|Implement|Address|Identify|Include|Demonstrate)\s/i.test(
      trimmed
    )
  ) {
    return true;
  }

  return false;
}

function extractQuestionText(line: string): string {
  let q = line.trim();
  // Remove leading numbering: "1. ", "1) ", "(1) ", "a. ", "a) "
  q = q.replace(/^\d+[.):\s]\s*/, "");
  q = q.replace(/^[a-z][.)]\s*/, "");
  q = q.replace(/^\([a-z]\)\s*/, "");
  // Remove bullet markers
  q = q.replace(/^[-•●◦▪]\s+/, "");
  return q.trim();
}

function isGuidanceLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Parenthetical guidance
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) return true;

  // Indented continuation (starts with lowercase or is a note)
  if (/^(Note|Hint|Tip|Reference|See|Refer|E\.g\.|e\.g\.|i\.e\.)/i.test(trimmed)) return true;

  // Lines starting with "- " under a question (sub-guidance)
  if (/^-\s+[a-z]/.test(trimmed)) return true;

  return false;
}

/* ------------------------------------------------------------------ */
/* Reverse YES/NO section detection                                    */
/* ------------------------------------------------------------------ */

function isReverseSection(sectionName: string | null, text: string): boolean {
  if (!sectionName) return false;
  // Check if this section's text in the document mentions "must answer NO"
  const sectionUpper = sectionName.toUpperCase();
  // Common reverse sections: hazard checks, risk items
  if (/HAZARD|RISK|DANGER|UNSAFE|DAMAGE/i.test(sectionUpper)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Main parser                                                         */
/* ------------------------------------------------------------------ */

export function parseAuditDocument(text: string): ParsedAuditResult {
  const { format: detectedFormat, hasReverseYesNo } = detectFormat(text);

  const lines = text.split("\n");
  const items: ParsedItem[] = [];
  const sections: string[] = [];

  let currentSection: string | null = null;
  let inReverseSection = false;
  let i = 0;

  // First pass: find reverse YES/NO sections if applicable
  const reverseSectionNames = new Set<string>();
  if (hasReverseYesNo && detectedFormat === "yes_no") {
    let scanSection: string | null = null;
    for (let j = 0; j < lines.length; j++) {
      const line = lines[j].trim();
      if (isSectionHeader(line, lines[j + 1]?.trim())) {
        scanSection = line.replace(/:$/, "").trim();
      }
      if (scanSection && /must\s+answer\s+no|answer\s+no/i.test(line)) {
        reverseSectionNames.add(scanSection);
      }
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const nextLine = lines[i + 1];

    // Skip empty lines, page breaks, headers/footers
    if (
      !trimmed ||
      /^page\s+\d+/i.test(trimmed) ||
      /^\d+\s*\/\s*\d+$/.test(trimmed) ||
      /^(YES|NO|N\/A|RATING|COMPLIANT|NON-COMPLIANT|COMMENTS?|ACTION|EVIDENCE|NOTES?)$/i.test(trimmed) ||
      trimmed.length <= 2
    ) {
      i++;
      continue;
    }

    // Check for section header
    if (isSectionHeader(trimmed, nextLine?.trim())) {
      currentSection = trimmed.replace(/:$/, "").trim();
      if (!sections.includes(currentSection)) {
        sections.push(currentSection);
      }
      inReverseSection = reverseSectionNames.has(currentSection) || isReverseSection(currentSection, text);
      i++;
      continue;
    }

    // Check for question
    if (isQuestionLine(trimmed)) {
      const question = extractQuestionText(trimmed);
      if (question.length < 5) {
        i++;
        continue;
      }

      // Collect guidance from following lines
      let guidance: string | null = null;
      const guidanceLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const gl = lines[j];
        if (!gl.trim()) break;
        if (isSectionHeader(gl.trim(), lines[j + 1]?.trim())) break;
        if (isQuestionLine(gl.trim())) break;
        if (isGuidanceLine(gl.trim())) {
          guidanceLines.push(gl.trim());
          j++;
        } else {
          break;
        }
      }
      if (guidanceLines.length > 0) {
        guidance = guidanceLines.join(" ");
      }

      // Determine response format for this item
      let itemFormat: AuditResponseFormat = detectedFormat;
      if (detectedFormat === "yes_no" && inReverseSection) {
        itemFormat = "reverse_yes_no";
      }

      items.push({
        section: currentSection,
        question,
        guidance,
        responseFormat: itemFormat,
      });

      i = j;
      continue;
    }

    i++;
  }

  return {
    detectedFormat,
    items,
    metadata: {
      totalItems: items.length,
      sections,
      hasReverseYesNo,
    },
  };
}
