/**
 * The "Get ready for your first shift" checklist on /my-portal.
 *
 * 2026-10-07: a new starter used to meet the same requirements in five
 * separate cards plus nine seeded to-dos, with nothing saying which ones
 * mattered or in what order. This is the one list. It is DERIVED, never
 * stored: GET /api/my-portal/get-ready gathers the facts (contract,
 * profile, Employment Hero payroll, required certificates, handbook
 * reading, policies, essential training, practical sign-off) and this
 * turns them into steps.
 *
 * Rule that matters: a step is only ever "done" because something was
 * DONE — never because there was nothing to check. (The first version read
 * "policies done" from a missing blocker, and showed it ticked for someone
 * who'd signed nothing, because the policies didn't exist.)
 *
 * Pure so the rules can be tested without rendering.
 */

export type GetReadyStepKey =
  | "contract"
  | "details"
  | "documents"
  | "reading"
  | "policies"
  | "training"
  | "practical";

export type InductionStatus = "new_starter" | "in_training" | "awaiting_signoff" | "cleared";

export interface GetReadyStep {
  key: GetReadyStepKey;
  label: string;
  hint: string;
  done: boolean;
  /** Where to go to complete it. Absent = not something the starter can do. */
  href?: string;
  /** Waiting on someone else (contract not issued yet, manager sign-off). */
  waiting?: boolean;
}

export interface GetReadyInput {
  status: InductionStatus;
  contract: { acknowledgedByStaff: boolean } | null;
  details: {
    /** Human list, e.g. ["a profile photo", "an emergency contact"]. */
    missing: string[];
  };
  payroll: {
    /** False when Employment Hero isn't connected (or we couldn't reach it). */
    applicable: boolean;
    linked: boolean;
    /** Their EH Self Setup (tax file declaration, bank, super) is finished. */
    complete: boolean;
  };
  documents: {
    /** Labels of required certificate types with nothing current on file. */
    missing: string[];
  };
  reading: {
    handbook: boolean;
    amanaWay: boolean;
  };
  /** KEY policies (Code of Conduct, Privacy …) — short version + signature. */
  keyPolicies: {
    /** How many exist; 0 hides the step (never "done" by default). */
    total: number;
    /** Titles not yet signed at their current version. */
    outstanding: string[];
  };
  training: { total: number; remaining: number };
  practical: { items: number; allSigned: boolean };
}

export function isNewStarter(status: InductionStatus) {
  return status !== "cleared";
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function buildGetReadySteps(input: GetReadyInput): GetReadyStep[] {
  const newStarter = isNewStarter(input.status);
  const steps: GetReadyStep[] = [];

  // 1. Contract
  if (input.contract) {
    steps.push({
      key: "contract",
      label: "Sign your contract",
      hint: input.contract.acknowledgedByStaff
        ? "Signed — you can download a copy any time"
        : "Read it through and sign at the bottom",
      done: input.contract.acknowledgedByStaff,
      href: "/my-contract",
    });
  } else if (newStarter) {
    // Only for new starters: long-standing staff whose contract predates
    // the dashboard shouldn't be nagged about a missing one.
    steps.push({
      key: "contract",
      label: "Sign your contract",
      hint: "Your contract is being prepared — we'll email you when it's ready",
      done: false,
      waiting: true,
    });
  }

  // 2. Your details — personal AND payroll (bank, super, tax via Employment Hero)
  const missing = [...input.details.missing];
  if (input.payroll.applicable && !input.payroll.complete) {
    missing.push(
      input.payroll.linked
        ? "your tax file declaration, bank and super (finish the Employment Hero setup we emailed you)"
        : "your bank, super and tax details (your Employment Hero invite is on its way)",
    );
  }
  steps.push({
    key: "details",
    label: "Add your details",
    hint: missing.length
      ? `Still needed: ${listOf(missing)}`
      : "Photo, contact details, emergency contact, bank, super and tax — all done",
    done: missing.length === 0,
    href:
      input.details.missing.length === 0 && input.payroll.applicable
        ? "/profile#payroll"
        : "/profile",
  });

  // 3. Compliance documents — every certificate required for their role
  steps.push({
    key: "documents",
    label: "Upload your compliance documents",
    hint: input.documents.missing.length
      ? `Still needed: ${listOf(input.documents.missing)}`
      : "All your required certificates are on file",
    done: input.documents.missing.length === 0,
    href: "/compliance",
  });

  // 4. Reading — the Staff Handbook and The Amana Way
  const toRead: string[] = [];
  if (!input.reading.handbook) toRead.push("the Staff Handbook");
  if (!input.reading.amanaWay) toRead.push("The Amana Way");
  steps.push({
    key: "reading",
    label: "Read the Staff Handbook and The Amana Way",
    hint: toRead.length ? `Still to read: ${listOf(toRead)}` : "Read and confirmed",
    done: toRead.length === 0,
    href: !input.reading.handbook ? "/tools/handbook" : "/tools/the-amana-way",
  });

  // 5. Key policies — read the short version and sign (only when some exist:
  // a step is never ticked just because there was nothing to sign).
  if (input.keyPolicies.total > 0) {
    const outstanding = input.keyPolicies.outstanding;
    steps.push({
      key: "policies",
      label:
        input.keyPolicies.total === 1 ? "Sign the key policy" : `Sign the ${input.keyPolicies.total} key policies`,
      hint: outstanding.length
        ? `Still to sign: ${listOf(outstanding)} — a short version of each, about 3 minutes`
        : "Signed",
      done: outstanding.length === 0,
      href: "/my-training#key-policies",
    });
  }

  // 6. Essential training (only when there is any)
  if (input.training.total > 0) {
    const left = input.training.remaining;
    steps.push({
      key: "training",
      label: "Complete your essential training",
      hint:
        left === 0
          ? "All essential courses complete"
          : `${left} of ${input.training.total} course${input.training.total === 1 ? "" : "s"} left`,
      done: left === 0,
      href: "/my-training",
    });
  }

  // 7. Week-1 practical (new starters only)
  if (newStarter && input.practical.items > 0) {
    steps.push({
      key: "practical",
      label: "First-week practical sign-off",
      hint: "Your centre manager signs this off with you during your first week",
      done: input.practical.allSigned,
      waiting: true,
    });
  }

  return steps;
}
