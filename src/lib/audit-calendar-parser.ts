/**
 * Compliance Calendar document parser.
 *
 * Parses a compliance calendar .docx document and extracts audit template
 * definitions including name, description, frequency, QA area, NQS reference,
 * and scheduled months.
 *
 * Expected document structure (Amana-style):
 *  - Tables 1:     Procedure table (skipped)
 *  - Tables 2-4:   Frequency grouping tables (MONTHLY, HALF YEARLY, YEARLY)
 *  - Tables 5-11:  DETAILS tables per QA area — columns: Name | Description | Frequency | NQS Reference
 *  - Tables 12-15: Monthly calendar tables — 3 months per table with audit names
 */

import { docxToHtml } from "@/lib/pandoc";

// Dynamic import to avoid ESM bundling issues in Next.js
async function getJSDOM() {
  const { JSDOM } = await import("jsdom");
  return JSDOM;
}

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export interface CalendarTemplateEntry {
  name: string;
  description: string;
  frequency: "monthly" | "half_yearly" | "yearly";
  qualityArea: number;
  nqsReference: string;
  scheduledMonths: number[];
}

export interface ParsedCalendarResult {
  templates: CalendarTemplateEntry[];
  metadata: {
    totalTemplates: number;
    qualityAreas: number[];
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const MONTH_NAMES: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/** Normalise a name for fuzzy matching: lowercase, collapse whitespace, remove trailing "audit"/"checklist"/"review". */
function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Get text content from an element, collapsing whitespace. */
function cellText(el: Element): string {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

/** Parse frequency string to enum value. */
function parseFrequency(freq: string): "monthly" | "half_yearly" | "yearly" {
  const lower = freq.toLowerCase().trim();
  if (lower.includes("month")) return "monthly";
  if (lower.includes("half") || lower.includes("bi")) return "half_yearly";
  if (lower.includes("year") || lower.includes("annual")) return "yearly";
  return "yearly"; // default
}

/** Detect if a table is a QA details table (has columns like Description, Frequency, NQS Reference). */
function isDetailsTable(headerTexts: string[]): boolean {
  const joined = headerTexts.join(" ").toUpperCase();
  return (
    joined.includes("DESCRIPTION") &&
    joined.includes("FREQUENCY") &&
    (joined.includes("NQS") || joined.includes("REFERENCE"))
  );
}

/** Extract month number from text that may contain extra content like "January 2026". */
function extractMonth(text: string): number | undefined {
  const lower = text.toLowerCase().trim();
  // Try exact match first
  if (MONTH_NAMES[lower] !== undefined) return MONTH_NAMES[lower];
  // Try partial match — check if text starts with a month name
  for (const [name, num] of Object.entries(MONTH_NAMES)) {
    if (lower.startsWith(name)) return num;
  }
  return undefined;
}

/** Detect if a table is a monthly calendar table (has month names in headers). */
function isMonthlyCalendarTable(headerTexts: string[]): boolean {
  let monthCount = 0;
  for (const h of headerTexts) {
    if (extractMonth(h) !== undefined) monthCount++;
  }
  return monthCount >= 1;
}

/** Extract QA area number from a header text like "QA 1 - COMPLIANCE TOOLS" or "QA 2". */
function extractQAArea(text: string): number | null {
  const match = text.match(/QA\s*(\d)/i);
  return match ? parseInt(match[1], 10) : null;
}

/* ------------------------------------------------------------------ */
/* Pass 1: Extract DETAILS tables (QA areas)                           */
/* ------------------------------------------------------------------ */

interface RawTemplateEntry {
  name: string;
  description: string;
  frequency: "monthly" | "half_yearly" | "yearly";
  qualityArea: number;
  nqsReference: string;
}

function extractDetailsTemplates(tables: Element[]): RawTemplateEntry[] {
  const entries: RawTemplateEntry[] = [];

  for (const table of tables) {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length < 2) continue;

    // Find the header row with column labels and detect QA area
    let qaArea = 0;
    let headerRowIdx = -1;
    let nameColIdx = -1;
    let descColIdx = -1;
    let freqColIdx = -1;
    let nqsColIdx = -1;

    for (let r = 0; r < Math.min(rows.length, 3); r++) {
      const cells = Array.from(rows[r].querySelectorAll("th, td"));
      const texts = cells.map((c) => cellText(c));

      // Check for QA area in any cell of this row
      for (const t of texts) {
        const qa = extractQAArea(t);
        if (qa !== null) qaArea = qa;
      }

      // Check if this row has the column headers
      const joined = texts.join(" ").toUpperCase();
      if (joined.includes("DESCRIPTION") && joined.includes("FREQUENCY")) {
        headerRowIdx = r;
        for (let c = 0; c < texts.length; c++) {
          const upper = texts[c].toUpperCase();
          if (upper.includes("DESCRIPTION")) descColIdx = c;
          else if (upper.includes("FREQUENCY")) freqColIdx = c;
          else if (upper.includes("NQS") || upper.includes("REFERENCE")) nqsColIdx = c;
          else if (
            upper.includes("COMPLIANCE TOOL") ||
            upper.includes("AUDIT") ||
            upper.includes("QA") ||
            c === 0
          ) {
            // First non-matched column or one containing QA/tool reference = name column
            if (nameColIdx === -1) nameColIdx = c;
          }
        }
        // If name col still not found, use column 0
        if (nameColIdx === -1) nameColIdx = 0;
        break;
      }
    }

    if (headerRowIdx === -1 || descColIdx === -1) continue;

    // Extract data rows
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const cells = Array.from(rows[r].querySelectorAll("th, td"));
      if (cells.length < 2) continue;

      const name = nameColIdx < cells.length ? cellText(cells[nameColIdx]) : "";
      const description = descColIdx < cells.length ? cellText(cells[descColIdx]) : "";
      const freqText = freqColIdx >= 0 && freqColIdx < cells.length ? cellText(cells[freqColIdx]) : "";
      const nqsRef = nqsColIdx >= 0 && nqsColIdx < cells.length ? cellText(cells[nqsColIdx]) : "";

      // Skip empty rows or header-like rows
      if (!name || name.length < 3) continue;
      if (name.toUpperCase().includes("DETAILS OF")) continue;
      if (name.toUpperCase().includes("COMPLIANCE TOOL")) continue;

      entries.push({
        name: name.trim(),
        description: description.trim(),
        frequency: parseFrequency(freqText),
        qualityArea: qaArea,
        nqsReference: nqsRef.trim(),
      });
    }
  }

  return entries;
}

/* ------------------------------------------------------------------ */
/* Pass 2: Extract monthly calendar tables                             */
/* ------------------------------------------------------------------ */

function extractMonthlySchedules(tables: Element[]): Map<string, Set<number>> {
  const scheduleMap = new Map<string, Set<number>>();

  for (const table of tables) {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length < 2) continue;

    // First, find which columns belong to which month
    // Month names appear in header rows, sometimes with colspan
    const colToMonth = new Map<number, number>();

    for (let r = 0; r < Math.min(rows.length, 2); r++) {
      const cells = Array.from(rows[r].querySelectorAll("th, td"));
      let colOffset = 0;
      for (const cell of cells) {
        const text = cellText(cell);
        const colspan = parseInt(cell.getAttribute("colspan") || "1", 10);
        const monthNum = extractMonth(text);
        if (monthNum !== undefined) {
          // Assign this month to all columns it spans
          for (let c = colOffset; c < colOffset + colspan; c++) {
            colToMonth.set(c, monthNum);
          }
        }
        colOffset += colspan;
      }
    }

    if (colToMonth.size === 0) continue;

    // Detect column ratio mismatch: header may have fewer cells than data rows.
    // E.g., header has 3 cells (Jan, Feb, Mar) but data rows have 12 cells
    // (each month uses 2 columns: audit name + empty spacer).
    // Expand colToMonth to cover the actual data row column count.
    const firstDataRow = rows.length > 2 ? rows[2] : rows[1];
    if (firstDataRow) {
      const dataCellCount = Array.from(firstDataRow.querySelectorAll("th, td")).length;
      const monthCount = colToMonth.size;
      if (dataCellCount > monthCount && monthCount > 0) {
        const colsPerMonth = Math.round(dataCellCount / monthCount);
        const sortedEntries = [...colToMonth.entries()].sort((a, b) => a[0] - b[0]);
        colToMonth.clear();
        sortedEntries.forEach(([, monthNum], idx) => {
          for (let c = idx * colsPerMonth; c < (idx + 1) * colsPerMonth; c++) {
            colToMonth.set(c, monthNum);
          }
        });
      }
    }

    // Now extract audit names from data rows
    // In the calendar tables, audit names appear in cells under each month
    for (let r = 1; r < rows.length; r++) {
      const cells = Array.from(rows[r].querySelectorAll("th, td"));
      let colOffset = 0;
      for (const cell of cells) {
        const colspan = parseInt(cell.getAttribute("colspan") || "1", 10);
        const text = cellText(cell);

        if (text && text.length >= 3) {
          // Find which month this column belongs to
          // Check all columns this cell spans
          let monthNum: number | undefined;
          for (let c = colOffset; c < colOffset + colspan; c++) {
            const m = colToMonth.get(c);
            if (m !== undefined) {
              monthNum = m;
              break;
            }
          }

          // Skip month name cells themselves (don't treat "January" as an audit name)
          if (monthNum && extractMonth(text) === undefined) {
            const normalised = normaliseName(text);
            if (!scheduleMap.has(normalised)) {
              scheduleMap.set(normalised, new Set());
            }
            scheduleMap.get(normalised)!.add(monthNum);
          }
        }

        colOffset += colspan;
      }
    }
  }

  return scheduleMap;
}

/* ------------------------------------------------------------------ */
/* Merge: Match templates with schedules                               */
/* ------------------------------------------------------------------ */

function mergeSchedules(
  templates: RawTemplateEntry[],
  scheduleMap: Map<string, Set<number>>,
): CalendarTemplateEntry[] {
  return templates.map((t) => {
    const normalised = normaliseName(t.name);

    // Try exact match first
    let months = scheduleMap.get(normalised);

    // Try fuzzy match if no exact match
    if (!months) {
      for (const [key, value] of scheduleMap) {
        if (key.includes(normalised) || normalised.includes(key)) {
          months = value;
          break;
        }
      }
    }

    // If still no match, infer from frequency
    let scheduledMonths: number[];
    if (months && months.size > 0) {
      scheduledMonths = Array.from(months).sort((a, b) => a - b);
    } else {
      // Infer from frequency
      switch (t.frequency) {
        case "monthly":
          scheduledMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
          break;
        case "half_yearly":
          scheduledMonths = [1, 7]; // Jan + Jul default
          break;
        case "yearly":
          scheduledMonths = [1]; // Jan default
          break;
        default:
          scheduledMonths = [1];
      }
    }

    return {
      name: t.name,
      description: t.description,
      frequency: t.frequency,
      qualityArea: t.qualityArea,
      nqsReference: t.nqsReference,
      scheduledMonths,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Main parser                                                         */
/* ------------------------------------------------------------------ */

export async function parseComplianceCalendar(
  buffer: Buffer,
): Promise<ParsedCalendarResult> {
  const html = await docxToHtml(buffer);
  const JSDOM = await getJSDOM();
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const allTables = Array.from(doc.querySelectorAll("table"));

  // Categorise tables
  const detailsTables: Element[] = [];
  const calendarTables: Element[] = [];

  for (const table of allTables) {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length < 1) continue;

    // Check first 2 rows for header content
    const firstTwoRows = rows.slice(0, 3);
    const headerTexts = firstTwoRows.flatMap((r) =>
      Array.from(r.querySelectorAll("th, td")).map((c) => cellText(c)),
    );

    if (isDetailsTable(headerTexts)) {
      detailsTables.push(table);
    } else if (isMonthlyCalendarTable(headerTexts)) {
      calendarTables.push(table);
    }
  }

  // Pass 1: Extract template definitions from DETAILS tables
  const rawTemplates = extractDetailsTemplates(detailsTables);

  // Pass 2: Extract monthly schedules from calendar tables
  const scheduleMap = extractMonthlySchedules(calendarTables);

  // Merge
  const templates = mergeSchedules(rawTemplates, scheduleMap);

  // Deduplicate by name (case-insensitive)
  const seen = new Set<string>();
  const uniqueTemplates = templates.filter((t) => {
    const key = t.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const qualityAreas = [...new Set(uniqueTemplates.map((t) => t.qualityArea))].sort();

  return {
    templates: uniqueTemplates,
    metadata: {
      totalTemplates: uniqueTemplates.length,
      qualityAreas,
    },
  };
}

/* ------------------------------------------------------------------ */
/* CSV Calendar Parser                                                  */
/* ------------------------------------------------------------------ */

const MONTH_HEADERS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/**
 * Parse a CSV compliance calendar.
 *
 * Expected format:
 *   Template Name, Frequency, NQS, QA, Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
 *   Assessment and Planning Cycle Audit, Monthly, 1.3.1, 1, x, x, x, x, x, x, x, x, x, x, x, x
 *   Bathroom Safety Audit, Half Yearly, 2.1.3, 2, x, , , , , , x, , , , , ,
 *
 * Month columns can use "x", "1", "yes", "✓" to indicate scheduled.
 */
export function parseCalendarCsv(csvContent: string): ParsedCalendarResult {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { templates: [], metadata: { totalTemplates: 0, qualityAreas: [] } };
  }

  // Parse header to find month column indices
  const headerCells = parseCSVLine(lines[0]);
  const monthColMap = new Map<number, number>(); // colIndex → monthNumber (1-12)

  for (let i = 0; i < headerCells.length; i++) {
    const h = headerCells[i].toLowerCase().trim();
    const monthIdx = MONTH_HEADERS.findIndex((m) => h.startsWith(m));
    if (monthIdx !== -1) {
      monthColMap.set(i, monthIdx + 1);
    }
  }

  // Find name, frequency, NQS, QA columns by header text
  const nameCol = headerCells.findIndex((h) =>
    /name|template|audit/i.test(h),
  );
  const freqCol = headerCells.findIndex((h) => /freq/i.test(h));
  const nqsCol = headerCells.findIndex((h) => /nqs|reference/i.test(h));
  const qaCol = headerCells.findIndex((h) => /qa|quality/i.test(h));

  if (nameCol === -1 || monthColMap.size === 0) {
    return { templates: [], metadata: { totalTemplates: 0, qualityAreas: [] } };
  }

  const templates: CalendarTemplateEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const name = cells[nameCol]?.trim();
    if (!name || name.length < 3) continue;

    const scheduledMonths: number[] = [];
    for (const [colIdx, monthNum] of monthColMap) {
      const val = (cells[colIdx] || "").trim().toLowerCase();
      if (val === "x" || val === "1" || val === "yes" || val === "✓" || val === "true") {
        scheduledMonths.push(monthNum);
      }
    }

    const freqRaw = (cells[freqCol] || "").trim().toLowerCase();
    let frequency: "monthly" | "half_yearly" | "yearly" = "yearly";
    if (/month/i.test(freqRaw)) frequency = "monthly";
    else if (/half|bi|semi/i.test(freqRaw)) frequency = "half_yearly";

    // If no months were marked, infer from frequency
    if (scheduledMonths.length === 0) {
      if (frequency === "monthly") {
        scheduledMonths.push(...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      } else if (frequency === "half_yearly") {
        scheduledMonths.push(1, 7);
      } else {
        scheduledMonths.push(1);
      }
    }

    const qa = parseInt(cells[qaCol] || "0", 10) || 0;
    const nqs = (cells[nqsCol] || "").trim();

    templates.push({
      name,
      description: "",
      frequency,
      qualityArea: qa,
      nqsReference: nqs,
      scheduledMonths: scheduledMonths.sort((a, b) => a - b),
    });
  }

  const qualityAreas = [...new Set(templates.map((t) => t.qualityArea))].sort();

  return {
    templates,
    metadata: {
      totalTemplates: templates.length,
      qualityAreas,
    },
  };
}

/** Simple CSV line parser handling quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
