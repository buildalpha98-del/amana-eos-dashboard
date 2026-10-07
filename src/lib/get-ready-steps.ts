/**
 * The "Get ready for your first shift" checklist on /my-portal.
 *
 * 2026-10-07: a new starter used to meet the same requirements in five
 * separate cards (onboarding progress, pending policies, compliance
 * certificates, training, the active contract) plus nine seeded to-dos —
 * with nothing saying which ones mattered or in what order. This is the one
 * list. It is DERIVED, never stored: the induction readiness blockers
 * (`getInductionReadiness`) supply details / WWCC / policies / training,
 * the portal payload supplies the contract, and the readiness route supplies
 * the week-1 practical sign-off.
 *
 * Pure so the rules can be tested without rendering.
 */

export type GetReadyStepKey =
  | "contract"
  | "details"
  | "wwcc"
  | "policies"
  | "training"
  | "practical";

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
  readiness: {
    status: "new_starter" | "in_training" | "awaiting_signoff" | "cleared";
    blockers: { kind: string; label: string }[];
    practical: unknown[];
    practicalAllSigned: boolean;
  };
  contract: { acknowledgedByStaff: boolean } | null;
  /** Does the user have any LMS enrolment at all? */
  hasTraining: boolean;
}

export function isNewStarter(status: GetReadyInput["readiness"]["status"]) {
  return status !== "cleared";
}

export function buildGetReadySteps({
  readiness,
  contract,
  hasTraining,
}: GetReadyInput): GetReadyStep[] {
  const blocker = (kind: string) =>
    readiness.blockers.find((b) => b.kind === kind);
  const newStarter = isNewStarter(readiness.status);
  const steps: GetReadyStep[] = [];

  if (contract) {
    steps.push({
      key: "contract",
      label: "Sign your contract",
      hint: contract.acknowledgedByStaff
        ? "Signed — you can download a copy any time"
        : "Read it through and sign at the bottom",
      done: contract.acknowledgedByStaff,
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

  steps.push({
    key: "details",
    label: "Add your details",
    hint: "A profile photo, your phone number and an emergency contact",
    done: !blocker("profile"),
    href: "/profile",
  });

  steps.push({
    key: "wwcc",
    label: "Upload your Working With Children Check",
    hint: "A photo or PDF of your WWCC clearance",
    done: !blocker("wwcc"),
    href: "/compliance",
  });

  steps.push({
    key: "policies",
    label: "Read and sign two policies",
    hint: "Child Safe Code of Conduct and Privacy Policy",
    done: !blocker("policies"),
    href: "/policies",
  });

  const courses = blocker("courses");
  if (courses || hasTraining) {
    steps.push({
      key: "training",
      label: "Complete your essential training",
      hint: courses ? courses.label : "All essential courses complete",
      done: !courses,
      href: "/my-training",
    });
  }

  if (newStarter && readiness.practical.length > 0) {
    steps.push({
      key: "practical",
      label: "First-week practical sign-off",
      hint: "Your centre manager signs this off with you during your first week",
      done: readiness.practicalAllSigned,
      waiting: true,
    });
  }

  return steps;
}
