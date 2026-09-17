import {
  NQS_ELEMENTS,
  NQS_LEGAL_CHECKS,
  type NqsElement,
  type NqsLegalCheck,
} from "@/lib/nqs-taxonomy";

/**
 * Merge stored per-service SAT rows with the fixed NQS taxonomy so API
 * consumers always receive all 40 elements and all legal checks — stored or
 * empty. Rows are created lazily on first write; a brand-new document has
 * zero rows but still renders the full form.
 */

export interface MergedElement extends NqsElement {
  evidence: string[];
  assessment: string;
}

export interface MergedLegalCheck extends NqsLegalCheck {
  assessment: string;
}

interface StoredElement {
  elementCode: string;
  evidence: string[];
  assessment: string;
}

interface StoredLegalCheck {
  checkKey: string;
  assessment: string;
}

export function mergeElements(stored: StoredElement[]): MergedElement[] {
  const byCode = new Map(stored.map((r) => [r.elementCode, r]));
  return NQS_ELEMENTS.map((el) => {
    const row = byCode.get(el.code);
    return {
      ...el,
      evidence: row?.evidence ?? [],
      assessment: row?.assessment ?? "not_assessed",
    };
  });
}

export function mergeLegalChecks(stored: StoredLegalCheck[]): MergedLegalCheck[] {
  const byKey = new Map(stored.map((r) => [r.checkKey, r]));
  return NQS_LEGAL_CHECKS.map((check) => ({
    ...check,
    assessment: byKey.get(check.checkKey)?.assessment ?? "not_assessed",
  }));
}
