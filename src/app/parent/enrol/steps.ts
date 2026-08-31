/**
 * The five enrolment steps, matching the progress bar Daniel specified:
 * Me → Child → Contacts → Billing → Agreement.
 */
export const ENROL_STEPS = [
  { key: "me", label: "Me", title: "About you" },
  { key: "child", label: "Child", title: "Your child" },
  { key: "contacts", label: "Contacts", title: "Contacts" },
  { key: "billing", label: "Billing", title: "Billing" },
  { key: "agreement", label: "Agreement", title: "Agreement" },
] as const;

export type EnrolStepKey = (typeof ENROL_STEPS)[number]["key"];
