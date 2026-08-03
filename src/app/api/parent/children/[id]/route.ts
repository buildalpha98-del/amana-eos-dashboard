import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Fields a PARENT may change about their own child.
 *
 * Deliberately partitioned rather than "everything":
 *
 *  - Personal details (name, DOB, Medicare, doctor, language) are the
 *    family's own information and they are the authority on it. Making
 *    them phone the office to fix a misspelt name is the kind of friction
 *    that leaves records wrong for years.
 *  - Identity fields (name, DOB) ARE editable but every change is logged.
 *    A DOB drives CCS eligibility and age-based ratios, so a silent edit
 *    is not acceptable even though a legitimate correction is common.
 *  - School, service, CRN, CCS status, room, tags and status are NOT
 *    editable here. Those are operational and drive money and placement;
 *    a parent changing them would desync the enrolment from the centre.
 */
const IDENTITY_FIELDS = ["firstName", "surname", "dob"] as const;

const updateChildSchema = z.object({
  // ── Identity — editable, but logged (see IDENTITY_FIELDS) ──
  firstName: z.string().trim().min(1).max(100).optional(),
  surname: z.string().trim().min(1).max(100).optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),

  // ── Personal details the family owns ──
  preferredName: z.string().trim().max(100).nullable().optional(),
  gender: z.string().trim().max(30).nullable().optional(),
  medicareNumber: z.string().trim().max(30).nullable().optional(),
  medicareExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  doctorName: z.string().trim().max(120).nullable().optional(),
  doctorPhone: z.string().trim().max(40).nullable().optional(),
  doctorAddress: z.string().trim().max(200).nullable().optional(),
  mainLanguageAtHome: z.string().trim().max(120).nullable().optional(),
  languagesOtherThanEnglish: z.string().trim().max(200).nullable().optional(),
  livesWith: z.string().trim().max(120).nullable().optional(),
  countryOfBirth: z.string().trim().max(120).nullable().optional(),
  additionalNeeds: z.string().trim().max(2000).nullable().optional(),
});

const updateMedicalSchema = z.object({
  medicalConditions: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
  immunisationStatus: z.string().optional(),
  dietary: z
    .object({
      requirements: z.array(z.string()).optional(),
      notes: z.string().max(500).optional(),
    })
    .optional(),
  actionPlanUrl: z.string().url().optional(),
});

/**
 * GET — the child's full record, as the family should be able to see it.
 *
 * There was no GET at all: ParentChild (from the list endpoint) carried
 * name, DOB, year level and medical flags and nothing else. A parent
 * couldn't see their child's Medicare number, doctor, language or
 * classroom, let alone check whether we had them right.
 */
export const GET = withParentAuth(async (_req, ctx) => {
  const params = await ctx.params;
  const childId = params?.id;
  if (!childId) throw ApiError.badRequest("childId is required");

  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: {
      id: true,
      enrolmentId: true,
      firstName: true,
      surname: true,
      preferredName: true,
      dob: true,
      gender: true,
      schoolName: true,
      yearLevel: true,
      medicareNumber: true,
      medicareExpiry: true,
      mainLanguageAtHome: true,
      languagesOtherThanEnglish: true,
      livesWith: true,
      countryOfBirth: true,
      additionalNeeds: true,
      vaccinationStatus: true,
      medical: true,
      dietary: true,
      address: true,
      status: true,
      service: { select: { id: true, name: true } },
    },
  });
  if (!child) throw ApiError.notFound("Child not found");
  if (!child.enrolmentId || !ctx.parent.enrolmentIds.includes(child.enrolmentId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }

  const { enrolmentId: _enrolmentId, ...rest } = child;
  // Doctor details are stored inside the medical JSON, not as columns.
  const med = (child.medical as Record<string, unknown>) ?? {};
  return NextResponse.json({
    ...rest,
    doctorName: (med.doctorName as string) ?? null,
    doctorPhone: (med.doctorPhone as string) ?? null,
    doctorAddress: (med.doctorAddress as string) ?? null,
    // Dates as plain calendar strings — a date input can't use an ISO
    // instant, and these are days not moments.
    dob: child.dob ? child.dob.toISOString().slice(0, 10) : null,
    medicareExpiry: child.medicareExpiry
      ? child.medicareExpiry.toISOString().slice(0, 10)
      : null,
    // Which fields this endpoint will accept back, so the UI doesn't have
    // to hardcode a second copy of the rule and drift from it.
    editableFields: [
      "firstName",
      "surname",
      "dob",
      "preferredName",
      "gender",
      "medicareNumber",
      "medicareExpiry",
      "doctorName",
      "doctorPhone",
      "doctorAddress",
      "mainLanguageAtHome",
      "languagesOtherThanEnglish",
      "livesWith",
      "countryOfBirth",
      "additionalNeeds",
    ],
  });
});

/** PUT — personal details. Medical stays on PATCH, which predates this. */
export const PUT = withParentAuth(async (req, ctx) => {
  const params = await ctx.params;
  const childId = params?.id;
  if (!childId) throw ApiError.badRequest("childId is required");

  const parsed = updateChildSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid details",
      parsed.error.flatten().fieldErrors,
    );
  }

  const existing = await prisma.child.findUnique({
    where: { id: childId },
    select: {
      id: true,
      enrolmentId: true,
      firstName: true,
      surname: true,
      dob: true,
      medical: true,
    },
  });
  if (!existing) throw ApiError.notFound("Child not found");
  if (
    !existing.enrolmentId ||
    !ctx.parent.enrolmentIds.includes(existing.enrolmentId)
  ) {
    throw ApiError.forbidden("You do not have access to this child");
  }

  const d = parsed.data;
  const DOCTOR_KEYS = ["doctorName", "doctorPhone", "doctorAddress"] as const;

  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    // Doctor fields are merged into the medical JSON below, not set as
    // columns — they don't exist as columns on Child.
    if ((DOCTOR_KEYS as readonly string[]).includes(k)) continue;
    if (k === "dob" || k === "medicareExpiry") {
      data[k] = v ? new Date(`${v}T00:00:00.000Z`) : null;
    } else {
      data[k] = v === "" ? null : v;
    }
  }

  const doctorPatch = DOCTOR_KEYS.filter((k) => d[k] !== undefined);
  if (doctorPatch.length > 0) {
    const med = { ...((existing.medical as Record<string, unknown>) ?? {}) };
    for (const k of doctorPatch) med[k] = d[k] || null;
    data.medical = med as Prisma.InputJsonValue;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const updated = await prisma.child.update({ where: { id: childId }, data });

  // Identity changes are logged loudly. A corrected spelling is normal;
  // a changed date of birth moves CCS eligibility and ratio bands, so it
  // must never happen invisibly.
  const identityChanges = IDENTITY_FIELDS.filter(
    (f) => d[f] !== undefined,
  ).map((f) => ({
    field: f,
    from:
      f === "dob"
        ? existing.dob?.toISOString().slice(0, 10) ?? null
        : (existing[f] as string | null),
    to: d[f] ?? null,
  }));

  if (identityChanges.length > 0) {
    logger.warn("Parent changed a child identity field", {
      childId,
      email: ctx.parent.email,
      changes: identityChanges,
    });
    // NOTE: not written to ActivityLog — that table requires a userId
    // and there is no staff user behind a parent's own edit. The
    // structured warning above carries the same before/after detail.
  }

  return NextResponse.json({ ok: true, child: { id: updated.id } });
});

export const PATCH = withParentAuth(async (req, ctx) => {
  const params = await ctx.params;
  const childId = params?.id;
  if (!childId) throw ApiError.badRequest("childId is required");

  const body = await parseJsonBody(req);
  const parsed = updateMedicalSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid medical data", parsed.error.flatten().fieldErrors);
  }

  const { parent } = ctx;

  // Verify child belongs to parent
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, enrolmentId: true, medical: true, dietary: true },
  });
  if (!child) throw ApiError.notFound("Child not found");
  if (!child.enrolmentId || !parent.enrolmentIds.includes(child.enrolmentId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }

  const { medicalConditions, allergies, medications, immunisationStatus, dietary, actionPlanUrl } =
    parsed.data;

  // Merge into existing medical JSON
  const existingMedical = (child.medical as Record<string, unknown>) ?? {};
  const updatedMedical = { ...existingMedical };
  if (medicalConditions !== undefined) updatedMedical.conditions = medicalConditions;
  if (allergies !== undefined) updatedMedical.allergies = allergies;
  if (medications !== undefined) updatedMedical.medications = medications;
  if (immunisationStatus !== undefined) updatedMedical.immunisationStatus = immunisationStatus;
  if (actionPlanUrl !== undefined) updatedMedical.actionPlanUrl = actionPlanUrl;

  // Merge dietary
  const existingDietary = (child.dietary as Record<string, unknown>) ?? {};
  const updatedDietary = dietary ? { ...existingDietary, ...dietary } : existingDietary;

  const updated = await prisma.child.update({
    where: { id: childId },
    data: {
      medical: updatedMedical as Prisma.InputJsonValue,
      dietary: Object.keys(updatedDietary).length > 0
        ? (updatedDietary as Prisma.InputJsonValue)
        : undefined,
    },
    select: {
      id: true,
      firstName: true,
      surname: true,
      medical: true,
      dietary: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(updated);
});
