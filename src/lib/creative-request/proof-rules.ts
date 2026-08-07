import type { CreativeRequestStatus, ProofDecision } from "@prisma/client";

/** What each proof decision does to the request status (Ziflow three-state:
 *  "approved with changes" closes the loop WITHOUT another proof round). */
export const DECISION_TO_STATUS: Record<ProofDecision, CreativeRequestStatus> = {
  approved: "approved",
  approved_with_changes: "approved",
  changes_requested: "changes_requested",
};

/** Proofs may only be sent while work is active. Upload auto-transitions
 *  the request to in_review. */
export function canUploadProof(status: CreativeRequestStatus): boolean {
  return status === "in_progress" || status === "changes_requested";
}

/** A bare "approved" needs no explanation; the other two must say what
 *  changes are expected. */
export function decisionNoteRequired(decision: ProofDecision): boolean {
  return decision !== "approved";
}
