import { prisma } from "@/lib/prisma";
import type { FocusAvatar } from "@/lib/avatar-focus-rotation";
import { getCurrentTerm, getNextTerm } from "@/lib/school-terms";

const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;

const FALLBACK = "[not yet recorded]";

function pick<T>(value: T | null | undefined, fallback: string = FALLBACK): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" && !value.trim()) return fallback;
  return String(value);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readableSnapshot(snapshot: unknown): {
  centreName: string;
  primaryDriver: string;
  driverContext: string;
  programmeFocus: string;
  schoolName: string;
  newsletterContactName: string;
} {
  const s = asObject(snapshot);
  const centreDetails = asObject(s.centreDetails);
  const schoolContacts = asObject(s.schoolContacts);
  const newsletterEditor = asObject(schoolContacts.newsletterEditor);
  const drivers = (s.parentDrivers as unknown[] | undefined) ?? [];
  const primaryDriverEntry = drivers[0];
  const primaryDriverObj = asObject(primaryDriverEntry);

  return {
    centreName: pick(centreDetails.officialName ?? centreDetails.shortName, FALLBACK),
    primaryDriver: pick(primaryDriverObj.label ?? primaryDriverObj.name, FALLBACK),
    driverContext: pick(primaryDriverObj.evidence ?? primaryDriverObj.notes, FALLBACK),
    programmeFocus: pick(s.programmeFocus, FALLBACK),
    schoolName: pick(centreDetails.schoolName, FALLBACK),
    newsletterContactName: pick(newsletterEditor.name, FALLBACK),
  };
}

function readableParentAvatar(parentAvatar: unknown): {
  demographicsBrief: string;
  primaryWant: string;
  psychoJson: string;
} {
  const p = asObject(parentAvatar);
  const demo = asObject(p.demographics);
  const psy = asObject(p.psychographics);
  const demographicsBrief = [demo.ageRange, demo.familyStructure, demo.income]
    .filter(Boolean)
    .join(" · ") || FALLBACK;
  return {
    demographicsBrief,
    primaryWant: pick(psy.primaryWant, FALLBACK),
    psychoJson: JSON.stringify(p.psychographics ?? {}, null, 2),
  };
}

function readableProgrammeMix(programmeMix: unknown): {
  programmeMixJson: string;
} {
  const m = asObject(programmeMix);
  return { programmeMixJson: JSON.stringify(m, null, 2) };
}

interface ContextBundle {
  insightsLog: string;
  newsletterPlacementsThisTerm: number;
  termPlacementTarget: number;
  lastContactDate: string;
  lastContactPurpose: string;
  activationsThisTerm: number;
  termActivationTarget: number;
  pastActivations: string;
  nextTermLabel: string;
}

async function buildContext(focus: FocusAvatar, now: Date): Promise<ContextBundle> {
  const fourWeeksAgo = new Date(now.getTime() - FOUR_WEEKS_MS);
  const term = getCurrentTerm(now);
  const next = getNextTerm(now);

  const [insights, placementCount, lastLiaison, activations] = await Promise.all([
    prisma.centreAvatarInsight.findMany({
      where: {
        centreAvatarId: focus.avatarId,
        occurredAt: { gte: fourWeeksAgo },
        status: { in: ["approved", "pending_review"] },
      },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true, insight: true, source: true },
      take: 12,
    }),
    prisma.schoolComm.count({
      where: {
        serviceId: focus.serviceId,
        type: "newsletter",
        status: { in: ["sent", "confirmed"] },
        OR: [
          { AND: [{ year: term.year }, { term: term.term }] },
          { AND: [{ year: null }, { sentAt: { gte: term.startsOn, lte: term.endsOn } }] },
        ],
      },
    }),
    prisma.centreAvatarSchoolLiaisonLog.findFirst({
      where: { centreAvatarId: focus.avatarId },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true, purpose: true },
    }),
    prisma.campaignActivationAssignment.findMany({
      where: {
        serviceId: focus.serviceId,
        campaign: {
          startDate: { gte: term.startsOn, lte: term.endsOn },
        },
      },
      select: {
        status: true,
        campaign: { select: { name: true, type: true, startDate: true } },
      },
      take: 10,
    }),
  ]);

  const insightsLog = insights.length === 0
    ? `- ${FALLBACK} (no insights logged in the past 4 weeks)`
    : insights
        .map((i) => `- ${i.occurredAt.toISOString().slice(0, 10)} (${i.source}): ${i.insight}`)
        .join("\n");

  const lastContactDate = lastLiaison?.occurredAt.toISOString().slice(0, 10) ?? FALLBACK;
  const lastContactPurpose = lastLiaison?.purpose ?? FALLBACK;

  const pastActivations = activations.length === 0
    ? `${FALLBACK} (none recorded for ${term.year} Term ${term.term})`
    : activations
        .map((a) => `${a.campaign.name} (${a.campaign.type}, status: ${a.status})`)
        .join("; ");

  return {
    insightsLog,
    newsletterPlacementsThisTerm: placementCount,
    termPlacementTarget: 2,
    lastContactDate,
    lastContactPurpose,
    activationsThisTerm: activations.length,
    termActivationTarget: 2,
    pastActivations,
    nextTermLabel: `Term ${next.term} ${next.year}`,
  };
}

export interface BuiltPrompts {
  ideation: string;
  avatarDeepDive: string;
  schoolLiaison: string;
  activationBrainstorm: string;
}

export async function buildTuesdayPrompts(focus: FocusAvatar, now: Date = new Date()): Promise<BuiltPrompts> {
  const snap = readableSnapshot(focus.snapshot);
  const parent = readableParentAvatar(focus.parentAvatar);
  const mix = readableProgrammeMix(focus.programmeMix);
  const ctx = await buildContext(focus, now);

  const ideation = `This week's focus is ${snap.centreName}. Their primary parent driver is ${snap.primaryDriver} (${snap.driverContext}). Their programme focus is ${snap.programmeFocus}.

Generate 5 social media post ideas (mix of feed, story, and reel) that speak directly to parents motivated by ${snap.primaryDriver}. Each idea should:
- Reference a specific moment or scenario at ${snap.centreName}
- Have a clear visual direction
- Include a CTA (booking, enquiry, or programme info)
- Be in Australian English, warm but professional tone`;

  const avatarDeepDive = `I'm doing my monthly deep-dive on the ${snap.centreName} Centre Avatar. Current state of the avatar:

Snapshot:
${JSON.stringify(focus.snapshot ?? {}, null, 2)}

Parent Avatar (psychographics):
${parent.psychoJson}

Programme Mix:
${mix.programmeMixJson}

Last 4 weeks of insights logged:
${ctx.insightsLog}

Based on this, what 3-5 questions should I be asking the coordinator at my next check-in to fill the gaps? What insights might I be missing? What should I push deeper on?`;

  const schoolLiaison = `${snap.centreName} is at ${ctx.newsletterPlacementsThisTerm}/${ctx.termPlacementTarget} newsletter placements this term. The school is ${snap.schoolName}. The newsletter contact is ${snap.newsletterContactName}, last contacted ${ctx.lastContactDate} about ${ctx.lastContactPurpose}.

Draft a warm, professional email to ${snap.newsletterContactName} re: ${ctx.nextTermLabel} newsletter placement. Reference our partnership, suggest 2-3 angles (e.g. holiday programme launch, parent testimonial feature, new programme spotlight), and ask for placement specs/deadline. Australian English, 150 words max.`;

  const activationBrainstorm = `${snap.centreName} is at ${ctx.activationsThisTerm}/${ctx.termActivationTarget} activations this term. Existing activations were: ${ctx.pastActivations}.

Brainstorm 3 activation ideas for this centre that would:
- Drive enrolment enquiries
- Showcase ${snap.programmeFocus}
- Suit the parent demographic (${parent.demographicsBrief})
- Be deliverable in 4-6 weeks with a moderate budget

For each idea, include: concept, target audience, expected attendance, content angles for recap.`;

  return { ideation, avatarDeepDive, schoolLiaison, activationBrainstorm };
}

export function bundlePromptBody(centreName: string, prompts: BuiltPrompts): string {
  return `Today's focus is **${centreName}** — copy any prompt below into Claude. Estimated time: 60 min.

---

## Prompt 1 — Content ideation

${prompts.ideation}

---

## Prompt 2 — Avatar deep-dive

${prompts.avatarDeepDive}

---

## Prompt 3 — School liaison opener

${prompts.schoolLiaison}

---

## Prompt 4 — Activation brainstorm

${prompts.activationBrainstorm}
`;
}
