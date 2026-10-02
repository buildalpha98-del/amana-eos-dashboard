/**
 * Human labels for email-flow timing and triggers. Pure — safe to import from
 * client components (the CRM Email flows page) and server routes alike.
 */

/** "Immediately", "4 hours after", "1 day before", "2 weeks after". */
export function describeDelay(delayHours: number): string {
  if (delayHours === 0) return "Immediately";
  const abs = Math.abs(delayHours);
  const when = delayHours < 0 ? "before" : "after";
  let amount: string;
  if (abs % 168 === 0) amount = plural(abs / 168, "week");
  else if (abs % 24 === 0) amount = plural(abs / 24, "day");
  else amount = plural(abs, "hour");
  return `${amount} ${when}`;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

const STAGE_LABELS: Record<string, string> = {
  new_enquiry: "New enquiry",
  info_sent: "Info sent",
  nurturing: "Nurturing",
  form_started: "Enrolment form started",
  first_session: "First session booked",
  new_lead: "New lead",
  meeting_booked: "Meeting booked",
  submitted: "Tender submitted",
};

export function describeTrigger(stage: string | null): string {
  if (!stage) return "Manual enrolment";
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, " ");
}
