import type { TipTapDoc, TipTapNode } from "./render-html";
import { MERGE_TAGS_BY_KEY } from "./merge-tag-catalog";

/**
 * Walk a TipTap document and return every distinct merge-tag key referenced
 * (e.g. "staff.firstName", "custom.payrunFrequency"). Order is preserved by
 * first appearance in document order.
 */
export function extractMergeTagKeys(doc: TipTapDoc | null | undefined): string[] {
  if (!doc) return [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  const walk = (nodes?: TipTapNode[]) => {
    if (!nodes) return;
    for (const n of nodes) {
      if (n.type === "mergeTag") {
        const key = n.attrs?.key;
        if (typeof key === "string" && key.length > 0 && !seen.has(key)) {
          seen.add(key);
          ordered.push(key);
        }
      }
      if (n.content) walk(n.content);
    }
  };
  walk(doc.content);
  return ordered;
}

/** "custom.payrunFrequency" → "Pay run frequency"; "remunerationPercent" → "Remuneration percent (%)". */
export function humanizeCustomTagKey(fullKey: string): string {
  const tail = fullKey.replace(/^custom\./, "");
  if (!tail) return fullKey;
  // Split camelCase boundaries into words, then collapse the result to sentence case.
  const withSpaces = tail
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  const lower = withSpaces.toLowerCase();
  let label = lower.charAt(0).toUpperCase() + lower.slice(1);
  if (/\bpercent\b/i.test(label)) {
    label = label.replace(/percent/gi, "percent (%)");
  }
  return label;
}

export type InferredFieldType = "text" | "number" | "longtext";

/** Pick an input type from a custom-tag key's suffix. */
export function inferCustomFieldType(fullKey: string): InferredFieldType {
  const tail = fullKey.split(".").pop() ?? "";
  if (/(Percent|Rate|Amount|Count|Quantity|Hours|Days)$/i.test(tail)) return "number";
  if (/(Notes|Details|Description|Summary|Comments)$/i.test(tail)) return "longtext";
  return "text";
}

export type DerivedCustomField = {
  /** Full merge-tag key, e.g. "custom.payrunFrequency". */
  key: string;
  label: string;
  type: InferredFieldType;
  /** Pre-filled value at issue time. Author can overwrite. */
  default?: string;
};

/**
 * Pre-filled values for known custom tags used by built-in presets.
 * Keyed by the full merge-tag key. Templates authored by hand won't
 * appear here unless the key matches one of these.
 */
const CUSTOM_TAG_DEFAULTS: Record<string, string> = {
  "custom.probationMonths": "6",
  "custom.includedHours": "5 hours",
  "custom.payFrequency": "fortnightly",
  "custom.additionalBenefits":
    "reimbursement of approved work-related expenses, access to leave entitlements and professional development opportunities",
  "custom.companyPropertyItems": "Uniform and all electronic equipment",
};

/**
 * Inspect a template body and return one input-field descriptor per distinct
 * tag that isn't already resolved automatically. Used by the issuance flow
 * to dynamically collect values without the template author having to
 * declare manualFields.
 *
 * A tag is considered "custom" (i.e. needs a manual input) if it either:
 *   1. Starts with `custom.` (the intended convention), or
 *   2. Doesn't match any built-in key in the merge-tag catalog
 *      (staff.*, service.*, contract.*, manager.*, system dates, signatures)
 *
 * The second rule is a safety net so a template author who forgets the
 * `custom.` prefix on a bespoke tag still gets a working input field at
 * issue time instead of a silently-blank value in the rendered doc.
 */
export function deriveCustomFields(
  doc: TipTapDoc | null | undefined,
): DerivedCustomField[] {
  return extractMergeTagKeys(doc)
    .filter((k) => k.startsWith("custom.") || !MERGE_TAGS_BY_KEY[k])
    .map((key) => {
      const field: DerivedCustomField = {
        key,
        label: humanizeCustomTagKey(key),
        type: inferCustomFieldType(key),
      };
      if (CUSTOM_TAG_DEFAULTS[key] !== undefined) {
        field.default = CUSTOM_TAG_DEFAULTS[key];
      }
      return field;
    });
}
