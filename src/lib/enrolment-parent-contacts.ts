/**
 * Helpers for turning an approved EnrolmentSubmission's parent JSON blobs
 * into first-class CentreContact records.
 *
 * Called by `PATCH /api/enrolments/[id]` when status → "processed".
 */

import type { Prisma } from "@prisma/client";

type PrismaLike = Prisma.TransactionClient | typeof import("@/lib/prisma").prisma;

interface ParentBlob {
  firstName?: string;
  surname?: string;
  email?: string;
  mobile?: string;
  crn?: string;
  dob?: string; // ISO date
  relationship?: string;
  occupation?: string;
  workplace?: string;
  workPhone?: string;
  address?: {
    street?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
  };
}

function normaliseAddress(addr: unknown): Prisma.JsonValue | null {
  if (!addr || typeof addr !== "object") return null;
  const a = addr as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of ["street", "suburb", "state", "postcode"] as const) {
    const v = a[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  }
  return Object.keys(out).length ? (out as Prisma.JsonValue) : null;
}

function parseDob(raw: unknown): Date | null {
  if (!raw) return null;
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export interface UpsertedContact {
  id: string;
  email: string;
  role: "primary" | "secondary";
  created: boolean;
}

/**
 * Upsert a single CentreContact row for one parent blob. Keyed by (email, serviceId).
 * Returns the contact + whether it was newly created (for downstream email triggering).
 */
export async function upsertParentContact(
  tx: PrismaLike,
  opts: {
    blob: ParentBlob;
    serviceId: string;
    enrolmentId: string;
    role: "primary" | "secondary";
  },
): Promise<UpsertedContact | null> {
  const email = opts.blob.email?.trim().toLowerCase();
  if (!email) return null;

  const data = {
    firstName: opts.blob.firstName?.trim() || null,
    lastName: opts.blob.surname?.trim() || null,
    mobile: opts.blob.mobile?.trim() || null,
    crn: opts.blob.crn?.trim() || null,
    dob: parseDob(opts.blob.dob),
    relationship: opts.blob.relationship?.trim() || null,
    occupation: opts.blob.occupation?.trim() || null,
    workplace: opts.blob.workplace?.trim() || null,
    workPhone: opts.blob.workPhone?.trim() || null,
    address: normaliseAddress(opts.blob.address) ?? undefined,
    parentRole: opts.role,
    sourceEnrolmentId: opts.enrolmentId,
  } as const;

  const existing = await tx.centreContact.findFirst({
    where: { email, serviceId: opts.serviceId },
    select: { id: true },
  });

  if (existing) {
    await tx.centreContact.update({
      where: { id: existing.id },
      data,
    });
    return { id: existing.id, email, role: opts.role, created: false };
  }

  const created = await tx.centreContact.create({
    data: { ...data, email, serviceId: opts.serviceId },
  });
  return { id: created.id, email, role: opts.role, created: true };
}

/**
 * Extract both primary + secondary parent blobs from an EnrolmentSubmission
 * and upsert CentreContact rows for each. Returns both results (primary may be
 * null only if the submission is malformed; secondary may be null if absent).
 */
export async function upsertContactsFromSubmission(
  tx: PrismaLike,
  submission: {
    id: string;
    serviceId: string | null;
    primaryParent: unknown;
    secondaryParent: unknown;
  },
): Promise<{ primary: UpsertedContact | null; secondary: UpsertedContact | null }> {
  if (!submission.serviceId) {
    return { primary: null, secondary: null };
  }

  const primary = await upsertParentContact(tx, {
    blob: (submission.primaryParent ?? {}) as ParentBlob,
    serviceId: submission.serviceId,
    enrolmentId: submission.id,
    role: "primary",
  });

  const secondary = submission.secondaryParent
    ? await upsertParentContact(tx, {
        blob: submission.secondaryParent as ParentBlob,
        serviceId: submission.serviceId,
        enrolmentId: submission.id,
        role: "secondary",
      })
    : null;

  return { primary, secondary };
}
