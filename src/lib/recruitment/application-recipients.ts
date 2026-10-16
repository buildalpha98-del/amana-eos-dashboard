/**
 * Who hears about a new job application (Daniel, 16 Oct 2026): HR always,
 * plus the state lead — Tracie for Victoria, Mirna for NSW — on the same
 * email. The ad's assigned recruiter (if any) is copied in too.
 */
export const HR_EMAIL = "hr@amanaoshc.com.au";

export const STATE_HIRING_LEADS: Record<string, string> = {
  VIC: "tracie@amanaoshc.com.au",
  NSW: "mirna@amanaoshc.com.au",
};

export function applicationRecipients(state: string | null | undefined, assignedEmail?: string | null): string[] {
  const lead = state ? STATE_HIRING_LEADS[state.toUpperCase()] : undefined;
  const all = [HR_EMAIL, lead, assignedEmail].filter((e): e is string => Boolean(e?.trim()));
  return [...new Set(all.map((e) => e.trim().toLowerCase()))];
}
