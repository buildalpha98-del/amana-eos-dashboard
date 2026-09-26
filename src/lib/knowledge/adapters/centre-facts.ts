import { prisma } from "@/lib/prisma";
import { mergeServiceContent } from "@/lib/service-content-shared";
import { upsertKnowledgeSource } from "../pipeline";
import type { UpsertResult } from "../types";

interface ServiceForFacts {
  id: string; name: string; address: string | null; phone: string | null; state: string | null;
  manager: { name: string | null } | null;
  content: unknown;
}

/** Staff-facing fields only — parent copy (about, tagline, enrolmentThankYou, heroImage) is never indexed. */
export function renderCentreFacts(s: ServiceForFacts): string {
  const c = mergeServiceContent(s.content);
  const lines: string[] = [`# ${s.name}`, ""];
  const add = (h: string, v: string | null | undefined) => {
    if (v && v.trim()) lines.push(`## ${h}`, "", v.trim(), "");
  };
  add("Address", s.address);
  add("Centre phone", s.phone);
  // Name only — User.phone is a personal mobile; the numbers a centre publishes live in `contacts`.
  add("Coordinator / manager", s.manager?.name ?? null);
  if (c.contacts.length) {
    lines.push("## Key contacts", "");
    for (const k of c.contacts) {
      const bits = [k.role, k.name, k.phone, k.email].filter(Boolean);
      if (bits.length) lines.push(`- ${bits.join(" — ")}`);
    }
    lines.push("");
  }
  add("Location within the school", c.locationWithinSchool);
  add("Meeting / evacuation points", c.meetingPoints);
  add("Daily routine", c.dailyRoutine);
  add("Food provider", c.foodProvider);
  add("Parent onboarding (how we onboard families)", c.parentOnboarding);
  add("Staff-only notes", c.staffNotes);
  return lines.join("\n");
}

export async function syncCentreFacts(serviceId: string): Promise<UpsertResult | null> {
  const s = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true, name: true, address: true, phone: true, state: true, content: true,
      manager: { select: { name: true } },
    },
  });
  if (!s) return null;
  return upsertKnowledgeSource({
    sourceKind: "centre_facts",
    externalId: `service:${s.id}`,
    title: `${s.name} — centre facts`,
    category: "centre",
    tier: "general",
    text: renderCentreFacts(s),
    serviceId: s.id,
    state: s.state,
    externalUrl: `/services/${s.id}?tab=overview&sub=about`, // where ServiceContentTab mounts (page.tsx ~571)
  });
}
