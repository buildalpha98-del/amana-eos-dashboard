/**
 * AI flag-scan for completed document-mode audits.
 *
 * Reads the staff's filled-in HTML, asks Claude to surface any
 * action items / non-compliance / hazards the auditor wrote, and
 * returns a structured list + a short narrative summary.
 *
 * Stored on AuditInstance.aiFlags (JSON) and aiSummary (text).
 * Triggered automatically when a doc-mode audit is completed
 * (PATCH /api/audits/[id]/document { complete: true }).
 */

import { generateText } from "@/lib/ai";
import { logger } from "@/lib/logger";

export interface AuditFlag {
  /** Short headline — what was flagged */
  title: string;
  /** Severity hint — keep the AI's set tight so the UI can colour it */
  severity: "high" | "medium" | "low";
  /** Short verbatim snippet from the audit that triggered the flag */
  snippet: string;
}

export interface AuditScanResult {
  flags: AuditFlag[];
  summary: string;
}

const SCAN_SYSTEM_PROMPT = `You review completed OSHC (Out-of-School-Hours-Care) compliance audits at Amana OSHC. Your job: read the auditor's filled-in document and pull out anything leadership needs to act on.

Be conservative. Only flag items that the auditor actually wrote about — do not invent issues. If the auditor marked everything compliant and wrote no concerns, return an empty flags array and a one-sentence "all good" summary.

What counts as a flag:
- Action items the auditor wrote (e.g. "follow up with the WHS officer", "replace expired extinguisher")
- Non-compliance, failures, or "No" answers next to safety/regulatory items
- Hazards, broken equipment, missing certificates
- Anything labelled "urgent", "needs attention", "overdue", "expired"

Do NOT flag:
- Items the auditor explicitly marked as compliant or resolved
- Items with no auditor input
- The audit's own instructions / boilerplate

Severity guide:
- high — child safety, regulatory non-compliance, expired certificates, immediate hazards
- medium — process gaps, missing documentation, items needing follow-up
- low — minor observations, suggestions, nice-to-haves

Respond with ONLY valid JSON in this exact shape, no markdown fence:
{
  "flags": [
    { "title": "...", "severity": "high|medium|low", "snippet": "..." }
  ],
  "summary": "One short paragraph for leadership."
}`;

/**
 * Strip HTML tags + collapse whitespace so we send the auditor's
 * actual content to the model, not the markup. Keeps line breaks
 * between block elements so list items / paragraphs stay separable.
 */
function htmlToPlainText(html: string): string {
  return html
    // Block-level breaks
    .replace(/<\/(p|div|li|h[1-6]|tr|td|th|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode the handful of entities mammoth produces
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Collapse runs of whitespace + blank lines
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Best-effort JSON parse from the model. The system prompt asks for
 * raw JSON but models sometimes wrap with ```json fences anyway —
 * strip those before parsing.
 */
function parseScanJson(raw: string): AuditScanResult | null {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.flags) || typeof parsed.summary !== "string") return null;

    const flags: AuditFlag[] = [];
    for (const f of parsed.flags) {
      if (
        f &&
        typeof f.title === "string" &&
        typeof f.snippet === "string" &&
        (f.severity === "high" || f.severity === "medium" || f.severity === "low")
      ) {
        flags.push({
          title: f.title.slice(0, 200),
          severity: f.severity,
          snippet: f.snippet.slice(0, 500),
        });
      }
    }
    return { flags, summary: parsed.summary.slice(0, 2000) };
  } catch (err) {
    logger.warn("audit AI scan: failed to parse model JSON", { err });
    return null;
  }
}

/**
 * Run the AI flag scan over a completed audit's HTML. Returns null
 * when the model is unavailable / unparseable — caller falls back
 * to storing no flags rather than crashing the completion.
 */
export async function scanAuditForFlags({
  templateName,
  serviceName,
  completedHtml,
}: {
  templateName: string;
  serviceName: string;
  completedHtml: string;
}): Promise<AuditScanResult | null> {
  const plain = htmlToPlainText(completedHtml);
  if (plain.length < 30) {
    // Empty / near-empty document — no point asking the model.
    return { flags: [], summary: "Audit completed with no auditor notes." };
  }

  // Trim to a model-friendly size. Claude Haiku handles ~200k tokens
  // but we cap at ~20k chars to keep latency tight and cost low; a
  // single OSHC audit is well under this.
  const trimmed = plain.length > 20_000 ? plain.slice(0, 20_000) + "\n…[truncated]" : plain;

  const prompt = `Audit: ${templateName}
Service: ${serviceName}

Auditor's completed document:
"""
${trimmed}
"""

Return the JSON described in the system prompt.`;

  try {
    const raw = await generateText(prompt, {
      system: SCAN_SYSTEM_PROMPT,
      maxTokens: 1500,
      temperature: 0,
    });
    return parseScanJson(raw);
  } catch (err) {
    logger.warn("audit AI scan: model call failed", { err });
    return null;
  }
}
