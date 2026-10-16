/**
 * Summer Holiday Quest job ads, one per region (Daniel, 16 Oct 2026).
 * "Create the Holiday Quest ads" on Hiring → Job ads makes these as DRAFTS
 * (not on the careers page) so they can be checked, then published.
 *
 * Pay is a simple range per state, as Daniel asked — casual rates under the
 * Children's Services Award, where someone sits depending on qualification
 * and experience. Victoria needs diploma-level educators (reg 356 + ACECQA's
 * Victorian list); NSW has no qualification requirement for OSHC educators.
 */
export const HOLIDAY_QUEST_WORK_PERIOD = "End of term – Christmas, then 4 Jan – late Jan 2027";

export interface HolidayQuestAd {
  key: string;
  state: "NSW" | "VIC";
  region: string;
  schools: string[];
  title: string;
  payRate: string;
  qualificationRequired: "none" | "diploma";
  notes: string;
}

const PAY = { VIC: "$40–$46 an hour + super (casual)", NSW: "$35–$45 an hour + super (casual)" } as const;

function ad(state: "NSW" | "VIC", region: string, schools: string[]): HolidayQuestAd {
  const vic = state === "VIC";
  const where = schools.join(", ");
  const notes = `Join our Holiday Quest team in ${region} these summer holidays!

Holiday Quest is Amana OSHC's school holiday program: action-packed days of excursions, incursions, sport, art and STEM for primary school children aged 5–12, run at our school-based centres from 7:00am to 6:00pm. We're looking for warm, reliable casual educators to help make it a summer to remember.

Where: ${where}
When: from the end of Term 4 up to Christmas, a break between Christmas and New Year, then from Monday 4 January until school goes back in late January 2027. Pick the weeks that suit you.
Pay: ${PAY[state]} — casual rates under the Children's Services Award. Where you sit in the range depends on your qualification and experience.

What you'll do
• Lead and join in games, sport, crafts and activities
• Supervise excursions and keep every child safe and accounted for
• Help serve healthy, halal meals and snacks
• Build warm relationships with children and their families

About you
${vic ? `• A diploma-level qualification approved for outside school hours care in Victoria (or you're enrolled and studying one). Lots of qualifications count — not just early-childhood diplomas: teaching and education degrees, Teacher Registration, community services, youth work, sport and recreation, and more. Not sure if yours counts? Apply anyway and we'll check.
` : `• No qualification needed — enthusiasm and reliability matter most. Qualifications and experience lift your pay.
`}• A valid ${vic ? "Victorian Working With Children Check" : "NSW Working With Children Check"} (or you're happy to apply — we'll help)
• Right to work in Australia
• First aid certificate is a bonus
• Respect for Islamic values and a love of working with children

Why Amana
We're a community-focused OSHC provider rooted in Islamic values, running services at Islamic schools across NSW and Victoria. You'll be part of a friendly team, with training and support from day one — and plenty of chances for more shifts during the school term.

Apply online in about 3 minutes. We'll be in touch within a few days.`;
  return {
    key: `${state.toLowerCase()}-${region.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    state,
    region,
    schools,
    title: `Holiday Quest Educator — ${region}${vic ? " (diploma-level)" : ""}`,
    payRate: PAY[state],
    qualificationRequired: vic ? "diploma" : "none",
    notes,
  };
}

export const HOLIDAY_QUEST_ADS: HolidayQuestAd[] = [
  ad("VIC", "North & West Melbourne", ["Al-Taqwa College (Truganina)", "AIA KKCC (Coburg)"]),
  ad("VIC", "South-East Melbourne", ["Minaret College Doveton", "Minaret College Officer", "Minaret College Springvale"]),
  ad("NSW", "South-West Sydney", ["Minarah College (Green Valley)", "MFIS Hoxton Park", "Unity Grammar (Austral)"]),
  ad("NSW", "Inner South-West Sydney", ["MFIS Greenacre", "Arkana College (Kingsgrove)"]),
  ad("NSW", "Hills District", ["MFIS Beaumont Hills"]),
];
