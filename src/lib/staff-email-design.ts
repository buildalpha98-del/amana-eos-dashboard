/**
 * Designed staff emails (Daniel, 12 Oct 2026): a StaffUpdate with `blocks`
 * is built in the same block builder as parent marketing emails, from the
 * shared template library, and goes out as its OWN email rather than inside
 * the Monday round-up.
 *
 * Pure (no prisma) so the composer's live preview renders the SAME HTML the
 * server sends.
 */
import { marketingLayout, renderBlocksToHtml, type EmailBlock, type EmailLayoutOptions } from "@/lib/email-marketing-layout";

/** Staff mail has no unsubscribe link — it's work communication, not marketing. */
export const STAFF_EMAIL_LAYOUT: EmailLayoutOptions = {
  headerColor: "#004E64",
  headerText: "Amana OSHC",
  footerText: "Amana OSHC · Staff update",
  footerUrl: "https://amanaoshc.com.au",
  footerUrlLabel: "amanaoshc.com.au",
  showUnsubscribe: false,
};

/**
 * Goes out as its OWN email (not inside the Monday round-up): built in the
 * block builder, or an HTML email pasted/uploaded by the office.
 */
export function isDesigned(u: { blocks: unknown; htmlContent?: string | null }): boolean {
  return isHtmlEmail(u) || (Array.isArray(u.blocks) && u.blocks.length > 0);
}

/** An HTML staff email (pasted or uploaded .html) — separate from parent marketing HTML. */
export function isHtmlEmail(u: { htmlContent?: string | null }): boolean {
  return !!u.htmlContent?.trim();
}

/** Same cap as the composer's .html upload (EmailHtmlEditor). */
export const MAX_STAFF_HTML_LENGTH = 1024 * 1024;

const escapeValue = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function personVariables(person: { name: string }) {
  // interpolateVariables inserts values RAW into HTML — escape them here.
  const first = escapeValue(person.name.trim().split(/\s+/)[0] || "there");
  return { firstName: first, name: escapeValue(person.name.trim()) || first };
}

/**
 * The HTML a pasted/uploaded staff email sends. A complete document (an
 * export from Canva/Zoho/Mailchimp carries its own <html>/<body> and
 * header) goes out exactly as designed; a fragment is wrapped in the staff
 * header/footer so it still looks like an Amana email. {{firstName}} and
 * {{name}} are filled per person — nothing else is touched.
 */
export function staffHtmlEmail(html: string, person: { name: string }): string {
  const vars = personVariables(person);
  const filled = html.replace(/\{\{\s*(firstName|name)\s*\}\}/g, (_m, k: "firstName" | "name") => vars[k]);
  return /<html[\s>]|<body[\s>]/i.test(filled) ? filled : marketingLayout(filled, STAFF_EMAIL_LAYOUT);
}

/** Plain-text summary of an HTML email — the card preview + notification body. */
export function htmlSummary(html: string, max = 600): string {
  return html
    .replace(/<(style|script|head|title)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>|<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, max);
}

/** Root-relative links ("/policies") need the dashboard origin in an email. */
function absolutise(blocks: EmailBlock[], origin: string): EmailBlock[] {
  const fix = (v?: string) => (v && /^\/(?!\/)/.test(v) ? `${origin}${v}` : v);
  return blocks.map((b) => ({ ...b, url: fix(b.url), linkUrl: fix(b.linkUrl) }));
}

export function staffDesignedHtml(
  blocks: EmailBlock[],
  person: { name: string },
  origin = "https://amanaoshc.company",
): string {
  return renderBlocksToHtml(absolutise(blocks, origin.replace(/\/$/, "")), personVariables(person), STAFF_EMAIL_LAYOUT);
}

/** Plain-text summary of a designed email — the card preview + notification body. */
export function blocksSummary(blocks: EmailBlock[], max = 600): string {
  return blocks
    .map((b) => (b.type === "heading" ? b.text : b.type === "text" ? b.content : ""))
    .filter(Boolean)
    .join("\n\n")
    .slice(0, max);
}
