/**
 * Audit document parser — extracts checklist items from .docx audit templates.
 *
 * Two parsing strategies:
 *  A. **HTML table parser** (preferred) — uses mammoth HTML + jsdom to preserve
 *     table structure.  Most audit documents are table-based.
 *  B. **Plain-text parser** (fallback) — line-by-line regex for non-table docs.
 *
 * Supports 4 structural patterns:
 *  1. YES / NO table           → yes_no
 *  2. Rating 1-5 table         → rating_1_5
 *  3. Compliant / Non-Compliant → compliant
 *  4. Date of Review            → review_date
 *
 * Special case: sections with "must answer NO" → reverse_yes_no
 *
 * Entry point:  `parseAuditDocumentHybrid(buffer)` — tries HTML first,
 *               falls back to plain text.
 */

import { docxToHtml, docxToText } from "@/lib/pandoc";

// Dynamic import to avoid ESM bundling issues in Next.js
async function getJSDOM() {
  const { JSDOM } = await import("jsdom");
  return JSDOM;
}

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

/* ================================================================== */
/* HTML table parser                                                    */
/* ================================================================== */

/** Column-role labels we try to detect in header rows. */
const RESPONSE_HEADERS = /^(yes|no|n\/a|na|rating|compliant|non[- ]?compliant|comments?|action|evidence|notes?|guidance|status|date|score)$/i;

/** Check if a header cell text is a response / meta column (not questions). */
function isResponseHeader(text: string): boolean {
  const h = text.replace(/\s+/g, " ").trim();
  if (!h) return false;
  if (RESPONSE_HEADERS.test(h)) return true;
  // Compound patterns common in audit documents
  if (/^yes\s*[\/&]\s*no$/i.test(h)) return true;
  if (/^action\s+(required|needed|plan|items?)/i.test(h)) return true;
  if (/^follow[- ]?up(\s+action)?$/i.test(h)) return true;
  if (/^corrective\s+action/i.test(h)) return true;
  if (/^further\s+action/i.test(h)) return true;
  return false;
}

/** Footer / metadata rows to skip when extracting questions from tables. */
const FOOTER_ROW_PATTERNS =
  /^(strengths?|areas?\s+(for|of)\s+improvement|action\s*(plan)?|comments?|name\s+(of\s+)?(auditor|assessor|reviewer)|signature|date(\s+(of\s+)?(audit|review))?|sign(ed)?(\s+by)?|endorsed|approved|reviewed|conducted|completed|assessed|auditor|assessor|overall\s+(rating|score|result)|centre\s*name|center\s*name|service\s*name|room|location|position|role|recommendation)$/i;

/** Patterns that identify the "question / item" column header. */
const QUESTION_COL_HEADERS = /^(question|item|criteria|checklist|description|standard|requirement|element|indicator|practice|area|detail|task|observation|audit item|audit question)/i;

/** Number-only cells (used to detect numbering columns). */
const NUMBER_ONLY = /^\d{1,4}\.?$/;

/**
 * Detect the response format from an array of header cell texts.
 */
function detectFormatFromHeaders(headers: string[]): AuditResponseFormat {
  const joined = headers.join(" ").toUpperCase();

  if (
    (joined.includes("RATING") && (joined.includes("1-5") || joined.includes("(1-5)"))) ||
    /RATING\s*[:.]?\s*[([]?1[\s-]+5/i.test(joined)
  ) {
    return "rating_1_5";
  }
  if (joined.includes("COMPLIANT") && joined.includes("NON")) {
    return "compliant";
  }
  if (joined.includes("DATE OF REVIEW") || joined.includes("REVIEW DATE")) {
    return "review_date";
  }
  // Default: any table with Yes/No-like columns
  return "yes_no";
}

/**
 * Determine whether a `<table>` looks like a question/checklist table.
 * Returns the detected column index for questions, or -1 if not a question table.
 */
function analyseTable(
  table: Element,
): {
  isQuestionTable: boolean;
  questionColIdx: number;
  guidanceColIdx: number;
  responseFormat: AuditResponseFormat;
  headerTexts: string[];
  sectionFromHeader: string | null;
} {
  const rows = Array.from(table.querySelectorAll("tr"));
  const neg = {
    isQuestionTable: false,
    questionColIdx: -1,
    guidanceColIdx: -1,
    responseFormat: "yes_no" as AuditResponseFormat,
    headerTexts: [],
    sectionFromHeader: null,
  };

  if (rows.length < 2) return neg; // need header + at least 1 data row

  // Grab first row as header candidate
  const headerCells = Array.from(rows[0].querySelectorAll("th, td"));
  if (headerCells.length < 2) return neg; // too few columns

  const headerTexts = headerCells.map((c) => (c.textContent || "").trim());

  // Phase 1: Classify each header column
  let responseMatches = 0;
  let questionColIdx = -1;
  let guidanceColIdx = -1;
  const isResp: boolean[] = headerTexts.map(() => false);
  const isNum: boolean[] = headerTexts.map(() => false);

  for (let i = 0; i < headerTexts.length; i++) {
    const h = headerTexts[i];
    if (isResponseHeader(h)) {
      isResp[i] = true;
      responseMatches++;
    } else if (QUESTION_COL_HEADERS.test(h)) {
      questionColIdx = i;
    } else if (/^(guidance|hint|reference|notes?)$/i.test(h)) {
      guidanceColIdx = i;
    } else if (/^(#|no\.?|item\s*#?|s\.?\s*no\.?)$/i.test(h)) {
      isNum[i] = true;
    }
  }

  // Phase 2: If question column not found but we have response columns,
  // the remaining non-response, non-numbering, non-guidance column is the question column
  if (questionColIdx === -1 && responseMatches > 0) {
    for (let i = 0; i < headerTexts.length; i++) {
      if (!isResp[i] && !isNum[i] && i !== guidanceColIdx && headerTexts[i].length >= 2) {
        questionColIdx = i;
        break;
      }
    }
  }

  // Phase 3: Try the column after a "#" / "No" / "No." numbering column
  if (questionColIdx === -1) {
    for (let i = 0; i < headerTexts.length; i++) {
      if (isNum[i] && i + 1 < headerTexts.length && !isResp[i + 1]) {
        questionColIdx = i + 1;
        break;
      }
    }
  }

  // Phase 4: Longest-text heuristic as last resort
  if (questionColIdx === -1 && rows.length > 1) {
    const colCount = headerTexts.length;
    const avgLen = new Array(colCount).fill(0);
    const dataRows = rows.slice(1, Math.min(rows.length, 6)); // sample up to 5 rows
    for (const r of dataRows) {
      const cells = Array.from(r.querySelectorAll("th, td"));
      for (let c = 0; c < Math.min(cells.length, colCount); c++) {
        avgLen[c] += (cells[c].textContent || "").trim().length;
      }
    }
    // Normalise
    for (let c = 0; c < colCount; c++) avgLen[c] /= dataRows.length || 1;

    // Skip columns that look like numbering or response columns
    let best = -1;
    let bestLen = 0;
    for (let c = 0; c < colCount; c++) {
      if (isResp[c]) continue;
      if (isNum[c]) continue;
      if (avgLen[c] > bestLen) {
        bestLen = avgLen[c];
        best = c;
      }
    }
    if (best >= 0 && bestLen > 10) {
      questionColIdx = best;
    }
  }

  // Determine section name from question column header
  // If the header text is NOT a standard column label (like "Question", "Item"),
  // it is likely a section name (e.g. "BATHROOM REQUIREMENTS")
  let sectionFromHeader: string | null = null;
  if (questionColIdx >= 0) {
    const qHeader = headerTexts[questionColIdx];
    if (qHeader && !QUESTION_COL_HEADERS.test(qHeader) && qHeader.length >= 3) {
      sectionFromHeader = qHeader.replace(/:$/, "").trim();
    }
  }

  // Need at least 1 response-like header AND a question column to be a question table
  const isQuestionTable = (responseMatches >= 1 && questionColIdx >= 0) || responseMatches >= 2;

  const responseFormat = detectFormatFromHeaders(headerTexts);

  return { isQuestionTable, questionColIdx, guidanceColIdx, responseFormat, headerTexts, sectionFromHeader };
}

/**
 * Extract text from an HTML element, collapsing whitespace.
 */
function cellText(el: Element): string {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

/**
 * Parse a mammoth-generated HTML string and extract audit items from tables.
 */
export async function parseAuditHtml(html: string): Promise<ParsedAuditResult> {
  const JSDOM = await getJSDOM();
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const items: ParsedItem[] = [];
  const sections: string[] = [];
  let globalFormat: AuditResponseFormat = "yes_no";
  let hasReverseYesNo = false;

  // Check for reverse YES/NO anywhere in the full text
  const fullText = doc.body.textContent || "";
  if (/MUST\s+ANSWER\s+NO/i.test(fullText) || /ANSWER\s+NO/i.test(fullText)) {
    hasReverseYesNo = true;
  }

  // Walk through the body's children in order so we can track section headings
  let currentSection: string | null = null;
  const body = doc.body;

  // Collect all top-level nodes (headings, paragraphs, tables)
  const walk = (parent: Element) => {
    for (const node of Array.from(parent.children)) {
      const tag = node.tagName.toLowerCase();

      // Heading elements → section names
      if (/^h[1-6]$/.test(tag)) {
        const text = cellText(node);
        if (text.length >= 3 && text.length <= 120) {
          currentSection = text.replace(/:$/, "").trim();
          if (!sections.includes(currentSection)) {
            sections.push(currentSection);
          }
        }
        continue;
      }

      // Bold / all-caps paragraphs before a table → section names
      if (tag === "p") {
        const text = cellText(node);
        const trimmed = text.trim();
        if (!trimmed) continue;

        // Check if the paragraph is a section header
        const isBold = node.querySelector("strong, b") !== null && cellText(node.querySelector("strong, b")!) === trimmed;
        const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && trimmed.length >= 5 && trimmed.length <= 80;

        if ((isBold || isAllCaps) && trimmed.length <= 120 && trimmed.length >= 3) {
          // Check if next sibling is a table (strong indicator of section header)
          const nextEl = node.nextElementSibling;
          if (nextEl && nextEl.tagName.toLowerCase() === "table") {
            currentSection = trimmed.replace(/:$/, "").trim();
            if (!sections.includes(currentSection)) {
              sections.push(currentSection);
            }
            continue;
          }
          // Even without a following table, all-caps lines are likely sections
          if (isAllCaps) {
            currentSection = trimmed.replace(/:$/, "").trim();
            if (!sections.includes(currentSection)) {
              sections.push(currentSection);
            }
            continue;
          }
        }
        continue;
      }

      // Tables → extract questions
      if (tag === "table") {
        const analysis = analyseTable(node);
        if (!analysis.isQuestionTable || analysis.questionColIdx < 0) continue;

        globalFormat = analysis.responseFormat;

        // If the question column header contains a section name, use it
        if (analysis.sectionFromHeader) {
          currentSection = analysis.sectionFromHeader;
          if (!sections.includes(currentSection)) {
            sections.push(currentSection);
          }
        }

        const rows = Array.from(node.querySelectorAll("tr"));
        // Skip header row
        for (let r = 1; r < rows.length; r++) {
          const cells = Array.from(rows[r].querySelectorAll("th, td"));

          // Detect section rows: rows where one cell spans multiple columns (colspan)
          // or row has bold/all-caps text in the first cell with short text
          if (cells.length === 1 || (cells.length >= 1 && cells[0].getAttribute("colspan"))) {
            const spanText = cellText(cells[0]).trim();
            if (spanText.length >= 3 && spanText.length <= 120) {
              // Check if this is a section header row
              const isAllCaps = spanText === spanText.toUpperCase() && /[A-Z]/.test(spanText) && spanText.length >= 3;
              const hasBold = cells[0].querySelector("strong, b") !== null;
              if (isAllCaps || hasBold) {
                currentSection = spanText.replace(/:$/, "").trim();
                if (!sections.includes(currentSection)) {
                  sections.push(currentSection);
                }
                continue;
              }
            }
          }

          if (analysis.questionColIdx >= cells.length) continue;

          const questionCell = cells[analysis.questionColIdx];
          let question = cellText(questionCell);

          // Skip empty cells, cells with just numbers, response-like cells, or footer rows
          if (!question || question.length < 5) continue;
          if (NUMBER_ONLY.test(question)) continue;
          if (isResponseHeader(question)) continue;
          if (FOOTER_ROW_PATTERNS.test(question)) continue;

          // Remove leading numbering
          question = question.replace(/^\d+[.):\s]\s*/, "");
          question = question.replace(/^[a-z][.)]\s*/, "");
          question = question.replace(/^\([a-z]\)\s*/, "");
          question = question.replace(/^[-•●◦▪]\s+/, "");
          question = question.trim();

          if (question.length < 5) continue;

          // Check for guidance column
          let guidance: string | null = null;
          if (analysis.guidanceColIdx >= 0 && analysis.guidanceColIdx < cells.length) {
            const g = cellText(cells[analysis.guidanceColIdx]);
            if (g && g.length > 0) {
              guidance = g;
            }
          }

          // Determine format for this item
          let itemFormat: AuditResponseFormat = analysis.responseFormat;
          if (
            itemFormat === "yes_no" &&
            hasReverseYesNo &&
            currentSection &&
            /HAZARD|RISK|DANGER|UNSAFE|DAMAGE/i.test(currentSection)
          ) {
            itemFormat = "reverse_yes_no";
          }

          items.push({
            section: currentSection,
            question,
            guidance,
            responseFormat: itemFormat,
          });
        }
        continue;
      }

      // Recurse into div/section wrappers
      if (tag === "div" || tag === "section" || tag === "article") {
        walk(node);
      }
    }
  };

  walk(body);

  return {
    detectedFormat: globalFormat,
    items,
    metadata: {
      totalItems: items.length,
      sections,
      hasReverseYesNo,
    },
  };
}

/* ================================================================== */
/* Hybrid orchestrator                                                  */
/* ================================================================== */

/**
 * Parse a .docx audit document.
 * Tries the HTML table parser first (preserves table structure),
 * falls back to the plain-text parser for non-table documents.
 */
export async function parseAuditDocumentHybrid(
  buffer: Buffer,
): Promise<ParsedAuditResult> {
  try {
    // Try HTML table parsing first
    const html = await docxToHtml(buffer);
    const htmlResult = await parseAuditHtml(html);

    // If HTML parser found items, use those
    if (htmlResult.items.length > 0) {
      return htmlResult;
    }
  } catch {
    // HTML parsing failed, fall through to plain text
  }

  // Fallback: plain text parser (for non-table documents)
  const text = await docxToText(buffer);
  return parseAuditDocument(text);
}
