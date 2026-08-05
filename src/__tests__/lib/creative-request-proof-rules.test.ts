import { describe, it, expect } from "vitest";
import {
  DECISION_TO_STATUS,
  canUploadProof,
  decisionNoteRequired,
} from "@/lib/creative-request/proof-rules";

describe("DECISION_TO_STATUS", () => {
  it("maps the three decisions", () => {
    expect(DECISION_TO_STATUS.approved).toBe("approved");
    expect(DECISION_TO_STATUS.approved_with_changes).toBe("approved");
    expect(DECISION_TO_STATUS.changes_requested).toBe("changes_requested");
  });
});

describe("canUploadProof", () => {
  it("allows upload from in_progress and changes_requested only", () => {
    expect(canUploadProof("in_progress")).toBe(true);
    expect(canUploadProof("changes_requested")).toBe(true);
    for (const s of ["new", "briefed", "in_review", "approved", "delivered", "cancelled"] as const) {
      expect(canUploadProof(s)).toBe(false);
    }
  });
});

describe("decisionNoteRequired", () => {
  it("requires a note except for plain approval", () => {
    expect(decisionNoteRequired("approved")).toBe(false);
    expect(decisionNoteRequired("approved_with_changes")).toBe(true);
    expect(decisionNoteRequired("changes_requested")).toBe(true);
  });
});
