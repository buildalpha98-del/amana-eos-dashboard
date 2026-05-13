/**
 * Shared Amana OSHC PDF branding primitives.
 *
 * Before this module landed, four different PDF generators
 * (`report-pdf`, `enrolment-pdf`, `welcome-pack-pdf`,
 * `billing/statement-pdf`) all hand-rolled the same Midnight Green
 * header bar, the same Jonquil + white "Amana OSHC." logo text, and
 * the same `checkPage` / `heading` / `row` helper trio. Any rebrand
 * touched four files; visual drift was already noticeable between
 * them.
 *
 * What this module gives you:
 *
 *   - `BRAND` — the three brand RGB triples (green / yellow / cream)
 *     used everywhere, exposed as both `[r, g, b]` tuples and `#hex`
 *     strings.
 *
 *   - `drawLogo(doc, opts)` — paints the canonical "Amana OSHC."
 *     two-tone logo text at the given anchor with the given font size.
 *
 *   - `createPdfBuilder(doc, opts)` — returns `{ checkPage, heading,
 *     row, paragraph }` closures bound to a jsPDF instance and a
 *     margin. Mirrors the helpers `enrolment-pdf` and
 *     `welcome-pack-pdf` each defined inline.
 *
 * Each individual document still controls its own layout — header
 * height, subtitle copy, right-aligned metadata, the body itself.
 * The shared piece is just the brand identity + the page-break /
 * heading / row primitives that were verbatim across files.
 */

import type jsPDF from "jspdf";

// ─── Brand constants ────────────────────────────────────────────────────────

export const BRAND = {
  // Midnight Green — primary header background
  green: { rgb: [0, 78, 100] as const, hex: "#004E64" },
  // Jonquil — "Amana" half of the logo
  yellow: { rgb: [254, 206, 0] as const, hex: "#FECE00" },
  // Lemon Chiffon — subtle subtitle text against green
  cream: { rgb: [255, 242, 191] as const, hex: "#FFF2BF" },
} as const;

// ─── Logo helper ────────────────────────────────────────────────────────────

export interface DrawLogoOptions {
  /** X coordinate (mm) of the start of "Amana". */
  x: number;
  /** Y coordinate (mm) of the logo's baseline. */
  y: number;
  /** Font size (jsPDF points). Default 18. */
  fontSize?: number;
}

/**
 * Render the two-tone "Amana OSHC." logo string. The "Amana" half
 * is painted in Jonquil; the " OSHC." half is white. Caller is
 * responsible for setting the surrounding fill (typically the
 * green header bar) BEFORE calling this.
 */
export function drawLogo(doc: jsPDF, opts: DrawLogoOptions): void {
  const { x, y, fontSize = 18 } = opts;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.setTextColor(...BRAND.yellow.rgb);
  doc.text("Amana", x, y);
  const amW = doc.getTextWidth("Amana");
  doc.setTextColor(255, 255, 255);
  doc.text(" OSHC.", x + amW, y);
}

// ─── PDF builder ────────────────────────────────────────────────────────────

export interface PdfBuilderOptions {
  /** Page margin in mm. Used as the X anchor for headings/rows. */
  margin: number;
  /** Auto-add-page threshold (default 275mm — fits A4 portrait). */
  pageBreakAtY?: number;
}

export interface PdfBuilder {
  /**
   * Live cursor — the Y coordinate where the next element should be
   * drawn. Each helper mutates this in place. Callers can also read
   * + write it directly when they need precise control (e.g. after
   * a custom header).
   */
  y: number;
  /** Auto-page-break when at least `needed` mm wouldn't fit. */
  checkPage(needed?: number): void;
  /** Section heading: green fill, white bold text, full content width. */
  heading(text: string): void;
  /** Label / value row. Skips rendering when value is null/undefined/"". */
  row(label: string, value: string | boolean | null | undefined): void;
  /** Body paragraph, wrapped to content width. */
  paragraph(text: string): void;
}

/**
 * Build the four shared layout helpers against a jsPDF instance.
 * Internally tracks the cursor `y` so callers don't need to thread
 * it through every call (matches how the original inline helpers
 * worked).
 */
export function createPdfBuilder(
  doc: jsPDF,
  opts: PdfBuilderOptions,
): PdfBuilder {
  const { margin, pageBreakAtY = 275 } = opts;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;

  // We keep cursor state on the returned object so callers can read +
  // write it freely. The internal helpers refer back to `state.y`.
  const state: PdfBuilder = {
    y: margin,
    checkPage(needed = 20) {
      if (state.y + needed > pageBreakAtY) {
        doc.addPage();
        state.y = margin;
      }
    },
    heading(text) {
      state.checkPage(15);
      doc.setFillColor(...BRAND.green.rgb);
      doc.rect(margin, state.y, contentWidth, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(text, margin + 3, state.y + 5.5);
      state.y += 12;
      doc.setTextColor(30, 30, 30);
    },
    row(label, value) {
      if (value === null || value === undefined || value === "") return;
      state.checkPage(6);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80, 80, 80);
      doc.text(label, margin, state.y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      const display =
        typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
      const lines = doc.splitTextToSize(display, contentWidth - 55);
      doc.text(lines, margin + 55, state.y);
      state.y += Math.max(lines.length * 4.5, 5);
    },
    paragraph(text) {
      state.checkPage(10);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 50, 50);
      const lines = doc.splitTextToSize(text, contentWidth);
      doc.text(lines, margin, state.y);
      state.y += lines.length * 4.5 + 3;
    },
  };

  return state;
}
