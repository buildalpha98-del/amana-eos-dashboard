/**
 * Enrolments → Follow-ups (Daniel, 16 Oct 2026): the two lists that keep a
 * family from falling through the cracks.
 *
 *  1. awaiting  — submitted enrolments still waiting on our reply, oldest
 *                 first, with the hours left on the 24-hour promise.
 *  2. unfinished — families who started the form, picked their school and
 *                 haven't touched it for 4+ days (after the two automatic
 *                 "need a hand?" emails). Hidden for 14 days once called.
 *
 * `serviceIds` null = every centre (admin tier); otherwise only those.
 */
import { prisma } from "@/lib/prisma";
import { matchSchoolToService } from "@/lib/school-service-match";
import { ENROL_STEPS } from "@/app/parent/enrol/steps";
import type { EnrolDraft } from "@/lib/enrol-draft";
import { REPLY_HOURS } from "@/lib/enrolment-reply-clock";

const H = 3_600_000;
const DAY = 24 * H;
const IDLE_DAYS = 4;
const CALLED_QUIET_DAYS = 14;
const UNFINISHED_LOOKBACK_DAYS = 60;

export interface AwaitingReply {
  id: string;
  submittedAt: string;
  hoursWaiting: number;
  hoursLeft: number;
  childNames: string;
  parentName: string;
  phone: string | null;
  serviceName: string | null;
}

export interface UnfinishedForm {
  accountId: string;
  parentName: string;
  email: string;
  phone: string | null;
  childName: string | null;
  serviceName: string;
  step: string;
  stepNumber: number;
  stepCount: number;
  lastSavedAt: string;
  daysIdle: number;
  reminderSentAt: string | null;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function names(children: unknown): string {
  const list = Array.isArray(children)
    ? children.map((c) => text((c as { firstName?: unknown })?.firstName)).filter(Boolean)
    : [];
  if (!list.length) return "Child";
  return list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}

export async function getFollowUps(
  serviceIds: string[] | null,
  now = new Date(),
): Promise<{ awaiting: AwaitingReply[]; unfinished: UnfinishedForm[] }> {
  const services = await prisma.service.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
  });
  const serviceName = new Map(services.map((s) => [s.id, s.name.replace(/^Amana OSHC\s+/i, "")]));
  const inScope = (id: string | null) => serviceIds === null || (!!id && serviceIds.includes(id));

  const subs = await prisma.enrolmentSubmission.findMany({
    where: {
      status: "submitted",
      createdAt: { gte: new Date(now.getTime() - 30 * DAY) },
      ...(serviceIds === null ? {} : { serviceId: { in: serviceIds } }),
    },
    select: { id: true, createdAt: true, serviceId: true, children: true, primaryParent: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  const awaiting: AwaitingReply[] = subs.map((s) => {
    const p = (s.primaryParent ?? {}) as Record<string, unknown>;
    const hoursWaiting = Math.floor((now.getTime() - s.createdAt.getTime()) / H);
    return {
      id: s.id,
      submittedAt: s.createdAt.toISOString(),
      hoursWaiting,
      hoursLeft: REPLY_HOURS - hoursWaiting,
      childNames: names(s.children),
      parentName: [text(p.firstName), text(p.surname)].filter(Boolean).join(" ") || "Parent",
      phone: text(p.mobile) || null,
      serviceName: s.serviceId ? serviceName.get(s.serviceId) ?? null : null,
    };
  });

  const drafts = await prisma.enrolmentDraft.findMany({
    where: {
      submittedAt: null,
      createdAt: { gte: new Date(now.getTime() - UNFINISHED_LOOKBACK_DAYS * DAY) },
      updatedAt: { lte: new Date(now.getTime() - IDLE_DAYS * DAY) },
      account: {
        deactivatedAt: null,
        OR: [{ followUpCalledAt: null }, { followUpCalledAt: { lt: new Date(now.getTime() - CALLED_QUIET_DAYS * DAY) } }],
      },
    },
    select: {
      currentStep: true,
      data: true,
      updatedAt: true,
      account: { select: { id: true, email: true, firstName: true, surname: true, enrolmentReminderSentAt: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: 200,
  });
  const unfinished: UnfinishedForm[] = [];
  for (const d of drafts) {
    const data = (d.data ?? {}) as EnrolDraft;
    const child = data.children?.[0];
    if (!child?.schoolName) continue; // no centre yet — nothing to route
    const match = matchSchoolToService(child.schoolName, services);
    if (!match.serviceId || !inScope(match.serviceId)) continue;
    const step = Math.min(Math.max(d.currentStep, 0), ENROL_STEPS.length - 1);
    unfinished.push({
      accountId: d.account.id,
      parentName:
        [text(data.me?.firstName) || d.account.firstName, text(data.me?.surname) || d.account.surname]
          .filter(Boolean)
          .join(" ") || d.account.email,
      email: d.account.email,
      phone: text(data.me?.mobile) || null,
      childName: text(child.firstName) || null,
      serviceName: serviceName.get(match.serviceId) ?? "",
      step: ENROL_STEPS[step].title,
      stepNumber: step + 1,
      stepCount: ENROL_STEPS.length,
      lastSavedAt: d.updatedAt.toISOString(),
      daysIdle: Math.floor((now.getTime() - d.updatedAt.getTime()) / DAY),
      reminderSentAt: d.account.enrolmentReminderSentAt?.toISOString() ?? null,
    });
  }
  return { awaiting, unfinished };
}

/** Which centre an unfinished form is for (its first child's school), or null. */
export async function draftServiceId(accountId: string): Promise<string | null> {
  const draft = await prisma.enrolmentDraft.findUnique({ where: { accountId }, select: { data: true } });
  const school = ((draft?.data ?? {}) as EnrolDraft).children?.[0]?.schoolName;
  if (!school) return null;
  const services = await prisma.service.findMany({ where: { status: "active" }, select: { id: true, name: true } });
  return matchSchoolToService(school, services).serviceId ?? null;
}
