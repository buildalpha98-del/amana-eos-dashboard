import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
import { normaliseTagList } from "@/lib/staff-tags";
const profileUpdateSchema = z.object({
  // Identity fields — self can update own; admins can update any staff member.
  // Role is intentionally NOT here — it lives on PATCH /api/users/[id], which
  // is fully admin-gated and has the last-owner guard.
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  addressStreet: z.string().optional(),
  addressSuburb: z.string().optional(),
  addressState: z.string().optional(),
  addressPostcode: z.string().optional(),
  taxFileNumber: z.string().optional(),
  superFundName: z.string().optional(),
  superMemberNumber: z.string().optional(),
  superUSI: z.string().optional(),
  visaStatus: z
    .enum([
      "citizen",
      "permanent_resident",
      "work_visa",
      "student_visa",
      "bridging_visa",
      "other",
    ])
    .optional(),
  visaExpiry: z.string().optional(),
  employmentType: z
    .enum(["casual", "part_time", "permanent", "fixed_term"])
    .optional(),
  startDate: z.string().optional(),
  probationEndDate: z.string().optional(),
  bankDetailsNote: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankBSB: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  xeroEmployeeId: z.string().optional(),
  // Free-form admin tags. Normalised + deduped server-side, see
  // /lib/staff-tags. Capped at MAX_TAGS_PER_USER; over-cap entries
  // are silently dropped past the limit rather than 400-ing.
  tags: z.array(z.string()).max(50).optional(),
});

// Fields staff can update on their own profile.
// Includes the Personal-details fields surfaced on /staff/[id]
// (phone, DOB, address) and the Employment-details fields a staff
// member can self-correct (start date, employment type, probation
// end date). Sensitive identifiers (TFN, xero ID, visa, tags) and
// admin-only assignments (role, serviceId) remain admin-only.
const STAFF_SELF_FIELDS = new Set([
  // Self-updatable identity (name/email allowed for self — they're not
  // privilege-bearing). Role is admin-only and lives on PATCH /api/users/[id].
  "name",
  "email",
  "phone",
  "dateOfBirth",
  "addressStreet",
  "addressSuburb",
  "addressState",
  "addressPostcode",
  "superFundName",
  "superMemberNumber",
  "superUSI",
  "bankDetailsNote",
  "bankAccountName",
  "bankBSB",
  "bankAccountNumber",
  "startDate",
  "employmentType",
  "probationEndDate",
]);

// GET /api/users/[id]/profile
export const GET = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  // Staff can only view own profile
  if (
    session!.user.role === "staff" &&
    session!.user.id !== id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatar: true,
      active: true,
      serviceId: true,
      phone: true,
      dateOfBirth: true,
      addressStreet: true,
      addressSuburb: true,
      addressState: true,
      addressPostcode: true,
      taxFileNumber: true,
      superFundName: true,
      superMemberNumber: true,
      superUSI: true,
      visaStatus: true,
      visaExpiry: true,
      employmentType: true,
      startDate: true,
      probationEndDate: true,
      bankDetailsNote: true,
      bankAccountName: true,
      bankBSB: true,
      bankAccountNumber: true,
      xeroEmployeeId: true,
      tags: true,
      createdAt: true,
      updatedAt: true,
      emergencyContacts: {
        orderBy: { isPrimary: "desc" },
      },
      qualifications: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
});

// PATCH /api/users/[id]/profile
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const isAdmin = ["owner", "admin"].includes(session!.user.role);
  const isSelf = session!.user.id === id;

  // Staff can only update own profile
  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await parseJsonBody(req);
  const parsed = profileUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Staff can only update non-sensitive self fields
  if (!isAdmin) {
    const attemptedKeys = Object.keys(parsed.data);
    const forbidden = attemptedKeys.filter((k) => !STAFF_SELF_FIELDS.has(k));
    if (forbidden.length > 0) {
      return NextResponse.json(
        { error: `You cannot update: ${forbidden.join(", ")}` },
        { status: 403 }
      );
    }
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Build update data
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;

    // Encrypt TFN
    if (key === "taxFileNumber" && value) {
      data.taxFileNumber = encrypt(value as string);
      continue;
    }

    // Normalise + dedupe tags before writing. Caller can pass any
    // case / whitespace; storage is always lowercased + hyphenated.
    if (key === "tags") {
      const { tags } = normaliseTagList(value as string[]);
      data.tags = tags;
      continue;
    }

    // Convert date strings to Date objects. Empty string (form was
    // cleared) maps to null so callers can unset a date by sending "".
    if (
      ["dateOfBirth", "visaExpiry", "startDate", "probationEndDate"].includes(
        key
      )
    ) {
      if (value === "" || value === null) {
        data[key] = null;
      } else if (value) {
        const dt = new Date(value as string);
        if (Number.isNaN(dt.getTime())) {
          return NextResponse.json(
            { error: `Invalid ${key}` },
            { status: 400 },
          );
        }
        data[key] = dt;
      }
      continue;
    }

    data[key] = value;
  }

  // Pre-flight email uniqueness check so a clash returns 409 with a clear
  // message instead of a 500 from Prisma's P2002 constraint violation.
  if (typeof data.email === "string" && data.email !== user.email) {
    const clash = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    if (clash && clash.id !== id) {
      return NextResponse.json(
        { error: "Another user already has that email address." },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      dateOfBirth: true,
      addressStreet: true,
      addressSuburb: true,
      addressState: true,
      addressPostcode: true,
      superFundName: true,
      superMemberNumber: true,
      superUSI: true,
      visaStatus: true,
      visaExpiry: true,
      employmentType: true,
      startDate: true,
      probationEndDate: true,
      bankDetailsNote: true,
      bankAccountName: true,
      bankBSB: true,
      bankAccountNumber: true,
      xeroEmployeeId: true,
      tags: true,
      updatedAt: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update_profile",
      entityType: "User",
      entityId: id,
      details: { fields: Object.keys(data) },
    },
  });

  return NextResponse.json(updated);
});
