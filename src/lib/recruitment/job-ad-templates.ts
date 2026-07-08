/**
 * Role-based job-ad templates for the New Vacancy form.
 *
 * Picking a role (+ centre) pre-fills the vacancy Notes with a professional
 * draft so recruiters only fill in the specifics. Blanks are written in
 * [UPPERCASE BRACKETS] so they're obvious and easy to find-and-replace.
 *
 * The Notes field becomes the public job ad on amanaoshc.com.au/careers, so
 * this copy is parent/candidate-facing and on-brand.
 */

const ROLE_TITLES: Record<string, string> = {
  educator: "OSHC Educator",
  senior_educator: "Senior OSHC Educator",
  member: "OSHC Coordinator",
  director: "Service Director",
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  casual: "Casual",
  part_time: "Part-time",
  permanent: "Permanent",
  fixed_term: "Fixed-term",
};

/** Role-specific middle sections. Everything else is shared scaffolding. */
const ROLE_BODY: Record<
  string,
  { summary: string; responsibilities: string[]; aboutYou: string[] }
> = {
  educator: {
    summary:
      "We're looking for a warm, reliable educator to help run our before and after school care program — creating fun, safe afternoons kids look forward to.",
    responsibilities: [
      "Supervise and actively engage primary-aged children in play, sport, arts and craft",
      "Support homework time and help serve healthy, halal afternoon tea",
      "Keep every child safe — roll calls, headcounts and our educator-to-child ratio",
      "Build warm, trusting relationships with children and their families",
    ],
    aboutYou: [
      "A genuine love of working with primary-school children",
      "A valid Working With Children Check (or willing to obtain one)",
      "Reliability and a positive, hands-on attitude",
      "Certificate III in School Age Education & Care desirable (or working towards) — not essential",
    ],
  },
  senior_educator: {
    summary:
      "We're looking for an experienced educator to lead activities on the floor, mentor the team, and step up in the coordinator's absence.",
    responsibilities: [
      "Plan and lead engaging activity sessions across the program",
      "Mentor and support educators, modelling best practice",
      "Take the lead on safety, ratios and daily routines",
      "Be a point of contact for families and the school",
    ],
    aboutYou: [
      "Experience in OSHC or a related childcare/education setting",
      "A valid Working With Children Check",
      "Certificate III or Diploma in a relevant field",
      "Confidence leading a group and supporting other educators",
    ],
  },
  member: {
    summary:
      "We're looking for an organised coordinator to run the day-to-day of the service — the program, the team and the family experience.",
    responsibilities: [
      "Coordinate rostering, program planning and daily operations",
      "Lead and support the educator team on the ground",
      "Own family communication and the day-to-day school partnership",
      "Keep the service compliant, safe and running smoothly",
    ],
    aboutYou: [
      "Experience in OSHC or childcare, ideally including some leadership",
      "Diploma in a relevant field (or equivalent experience)",
      "Strong organisation and people skills",
      "A valid Working With Children Check",
    ],
  },
  director: {
    summary:
      "We're looking for an experienced leader to take end-to-end ownership of the service — the team, the quality, the families and the numbers.",
    responsibilities: [
      "Lead, roster and develop the on-site team",
      "Own quality and compliance under the National Quality Framework and My Time, Our Place",
      "Build strong relationships with families and the partner school",
      "Manage enrolments, occupancy and the service budget",
    ],
    aboutYou: [
      "Proven leadership experience in OSHC, childcare or education",
      "A Diploma or degree in a relevant field",
      "Strong understanding of the NQF and child-safety obligations",
      "A valid Working With Children Check",
    ],
  },
};

function bullets(items: string[]): string {
  return items.map((i) => `• ${i}`).join("\n");
}

/**
 * Build a pre-filled job ad for the given role. `centreName` and
 * `employmentType` are interpolated when known; blanks stay bracketed.
 */
export function buildJobAdTemplate(
  role: string,
  centreName: string | undefined,
  employmentType: string | undefined,
): string {
  const title = ROLE_TITLES[role] ?? "OSHC Team Member";
  const centre = centreName?.trim() || "[CENTRE]";
  const employment = employmentType
    ? EMPLOYMENT_LABELS[employmentType] ?? employmentType
    : "[EMPLOYMENT TYPE]";
  const body = ROLE_BODY[role] ?? ROLE_BODY.educator;

  return `${title} — Amana OSHC, ${centre}

About the role
Amana OSHC delivers Islamic-values-based before and after school care right on our school grounds. ${body.summary}

What you'll do
${bullets(body.responsibilities)}

About you
${bullets(body.aboutYou)}

Why you'll love working here
• A 1-to-12 educator-to-child ratio — real time with each child, not babysitting
• A faith-aligned environment inside an Islamic school, with halal food and prayer space
• A structured, genuinely fun program with a supportive team

The details
• Pay: [PAY RATE — e.g. $30–$35 per hour, before super]
• Hours & days: [e.g. Mon–Fri, before school 6:30–9:00am and/or after school 3:00–6:30pm]
• Employment type: ${employment}
• Start date: [START DATE]
• Location: ${centre}

[ANYTHING ELSE SPECIFIC TO THIS ROLE — e.g. must-have availability, extra requirements]`;
}
