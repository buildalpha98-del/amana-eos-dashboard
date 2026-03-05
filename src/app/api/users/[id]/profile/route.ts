import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { encrypt } from "@/lib/encryption";

const profileUpdateSchema = z.object({
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
  xeroEmployeeId: z.string().optional(),
});

// Fields staff can update on their own profile
const STAFF_SELF_FIELDS = new Set([
  "phone",
  "addressStreet",
  "addressSuburb",
  "addressState",
  "addressPostcode",
  "superFundName",
  "superMemberNumber",
  "superUSI",
  "bankDetailsNote",
]);

// GET /api/users/[id]/profile
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

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
      xeroEmployeeId: true,
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
}

// PATCH /api/users/[id]/profile
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const isAdmin = ["owner", "admin"].includes(session!.user.role);
  const isSelf = session!.user.id === id;

  // Staff can only update own profile
  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
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

    // Convert date strings to Date objects
    if (
      ["dateOfBirth", "visaExpiry", "startDate", "probationEndDate"].includes(
        key
      ) &&
      value
    ) {
      data[key] = new Date(value as string);
      continue;
    }

    data[key] = value;
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
      xeroEmployeeId: true,
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
}
