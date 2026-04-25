import { prisma } from "@/lib/prisma";

const FALLBACK = "[contact name to confirm]";
const FALLBACK_EMAIL = "[contact email to confirm]";

interface AvatarSlim {
  snapshot: unknown;
  parentAvatar: unknown;
  programmeMix: unknown;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pickSuggestionAngles(avatar: AvatarSlim): string[] {
  const snap = asObject(avatar.snapshot);
  const parent = asObject(avatar.parentAvatar);
  const psy = asObject(parent.psychographics);
  const mix = asObject(avatar.programmeMix);

  const programmeFocus = typeof snap.programmeFocus === "string" ? snap.programmeFocus : null;
  const primaryWant = typeof psy.primaryWant === "string" ? psy.primaryWant : null;
  const whatsWorking = typeof mix.whatsWorking === "string" ? mix.whatsWorking : null;

  const angles: string[] = [];
  if (programmeFocus) angles.push(`Programme spotlight: ${programmeFocus}`);
  if (primaryWant) angles.push(`Parent voice: families looking for ${primaryWant}`);
  if (whatsWorking) angles.push(`What's working at our centre: ${whatsWorking}`);
  while (angles.length < 3) {
    angles.push("Holiday programme launch");
  }
  return angles.slice(0, 3);
}

export interface CentreChaseEntry {
  serviceId: string;
  serviceName: string;
  schoolName: string | null;
  newsletterContactName: string | null;
  newsletterContactEmail: string | null;
  subject: string;
  body: string;
  skipped: boolean;
  skipReason?: string;
}

export interface ChaseResult {
  entries: CentreChaseEntry[];
  termInfo: {
    currentTermLabel: string;
    nextTermLabel: string;
    weeksUntilTermEnd: number;
  };
}

export async function buildNewsletterChase(opts: {
  currentTerm: { year: number; number: 1 | 2 | 3 | 4 };
  nextTerm: { year: number; number: 1 | 2 | 3 | 4 };
  weeksUntilTermEnd: number;
  now: Date;
}): Promise<ChaseResult> {
  const services = await prisma.service.findMany({
    where: { status: "active" },
    orderBy: { code: "asc" },
    select: { id: true, name: true, state: true, code: true },
  });

  const avatarsByService = new Map<string, AvatarSlim>();
  const avatars = await prisma.centreAvatar.findMany({
    where: { serviceId: { in: services.map((s) => s.id) } },
    select: { serviceId: true, snapshot: true, parentAvatar: true, programmeMix: true },
  });
  for (const a of avatars) avatarsByService.set(a.serviceId, a);

  const existingNextTermComms = await prisma.schoolComm.findMany({
    where: {
      serviceId: { in: services.map((s) => s.id) },
      type: "newsletter",
      status: { in: ["sent", "confirmed"] },
      year: opts.nextTerm.year,
      term: opts.nextTerm.number,
    },
    select: { serviceId: true },
  });
  const alreadyDone = new Set(existingNextTermComms.map((c) => c.serviceId));

  const weekWord = opts.weeksUntilTermEnd === 1 ? "week" : "weeks";

  const entries: CentreChaseEntry[] = services.map((svc) => {
    const avatar = avatarsByService.get(svc.id);
    const snap = asObject(avatar?.snapshot);
    const centreDetails = asObject(snap.centreDetails);
    const schoolContacts = asObject(snap.schoolContacts);
    const newsletter = asObject(schoolContacts.newsletterEditor);

    const schoolName = typeof centreDetails.schoolName === "string" ? centreDetails.schoolName : null;
    const contactName = typeof newsletter.name === "string" && newsletter.name.trim() ? newsletter.name : null;
    const contactEmail = typeof newsletter.email === "string" && newsletter.email.trim() ? newsletter.email : null;

    if (alreadyDone.has(svc.id)) {
      return {
        serviceId: svc.id,
        serviceName: svc.name,
        schoolName,
        newsletterContactName: contactName,
        newsletterContactEmail: contactEmail,
        subject: "",
        body: "",
        skipped: true,
        skipReason: "already_booked_for_next_term",
      };
    }

    const angles = pickSuggestionAngles(avatar ?? { snapshot: {}, parentAvatar: {}, programmeMix: {} });

    const subject = `Term ${opts.nextTerm.number} newsletter — Amana OSHC at ${schoolName ?? svc.name}`;

    const body = `Hi ${contactName ?? FALLBACK},

I hope you're well. With Term ${opts.currentTerm.number} wrapping up in ${opts.weeksUntilTermEnd} ${weekWord}, I wanted to lock in our placement for the Term ${opts.nextTerm.number} newsletter and confirm our content angle.

A few directions we'd love to feature:
- ${angles[0]}
- ${angles[1]}
- ${angles[2]}

Could you let me know:
1. Your preferred placement deadline?
2. Word count and image specs?
3. Whether the Term ${opts.nextTerm.number} newsletter is going out in Week 1 or later?

Happy to draft the copy to your spec — just let me know what you need from us.

Many thanks,
Akram
Marketing Coordinator, Amana OSHC`;

    return {
      serviceId: svc.id,
      serviceName: svc.name,
      schoolName,
      newsletterContactName: contactName,
      newsletterContactEmail: contactEmail ?? FALLBACK_EMAIL,
      subject,
      body,
      skipped: false,
    };
  });

  return {
    entries,
    termInfo: {
      currentTermLabel: `Term ${opts.currentTerm.number} ${opts.currentTerm.year}`,
      nextTermLabel: `Term ${opts.nextTerm.number} ${opts.nextTerm.year}`,
      weeksUntilTermEnd: opts.weeksUntilTermEnd,
    },
  };
}

export function bundleChaseBody(result: ChaseResult): string {
  const lines: string[] = [];
  lines.push(`**${result.termInfo.currentTermLabel} ends in ${result.termInfo.weeksUntilTermEnd} week(s).**`);
  lines.push(`Chasing ${result.termInfo.nextTermLabel} newsletter placements.`);
  lines.push("");
  lines.push(`Active centres: ${result.entries.length}.`);
  const skipped = result.entries.filter((e) => e.skipped);
  if (skipped.length > 0) {
    lines.push(
      `Skipped (already booked for next term): ${skipped.map((s) => s.serviceName).join(", ")}`,
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const entry of result.entries) {
    if (entry.skipped) continue;
    lines.push(`## ${entry.serviceName} → ${entry.schoolName ?? "[school name to confirm]"}`);
    lines.push(`To: ${entry.newsletterContactName ?? "[contact name to confirm]"} <${entry.newsletterContactEmail ?? "[email to confirm]"}>`);
    lines.push(`Subject: ${entry.subject}`);
    lines.push("");
    lines.push(entry.body);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}
