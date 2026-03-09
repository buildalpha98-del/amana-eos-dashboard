import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { welcomeEmail } from "@/lib/email-templates";
import { passwordSchema } from "@/lib/schemas/auth";

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  password: passwordSchema,
  role: z.enum(["owner", "admin", "member", "staff"]).default("member"),
  serviceId: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
});

// GET /api/users — list all users (any authenticated user)
// Optional filters: ?serviceId=xxx&role=xxx&active=true
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const role = searchParams.get("role");
  const active = searchParams.get("active");

  const users = await prisma.user.findMany({
    where: {
      ...(serviceId ? { serviceId } : {}),
      ...(role ? { role: role as any } : {}),
      ...(active !== null && active !== undefined
        ? { active: active === "true" }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      avatar: true,
      serviceId: true,
      state: true,
      service: { select: { id: true, name: true, code: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(users);
}

// POST /api/users — create a new user (owner + admin)
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { name, email, password, role, serviceId, state } = parsed.data;

  // Guard: admins cannot create owner-level users
  if (session!.user.role !== "owner" && role === "owner") {
    return NextResponse.json(
      { error: "Only owners can create other owner accounts." },
      { status: 403 }
    );
  }

  // Validate: staff and member roles require a serviceId
  if ((role === "staff" || role === "member") && !serviceId) {
    return NextResponse.json(
      { error: "Staff and member users must be assigned to a service/centre" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      serviceId: (role === "staff" || role === "member") ? (serviceId || null) : null,
      state: role === "admin" ? (state || null) : null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      serviceId: true,
      state: true,
      service: { select: { id: true, name: true, code: true } },
      createdAt: true,
    },
  });

  // Log the activity
  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "User",
      entityId: user.id,
      details: { name: user.name, email: user.email, role: user.role, serviceId: user.serviceId },
    },
  });

  // Send welcome email with temporary password
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const loginUrl = `${baseUrl}/login`;
  const { subject, html } = welcomeEmail(name.split(" ")[0], password, loginUrl);

  const resend = getResend();
  if (resend) {
    try {
      await resend.emails.send({ from: FROM_EMAIL, to: email, subject, html });
    } catch (emailErr) {
      console.error("Failed to send welcome email:", emailErr);
      // Don't fail user creation if email fails
    }
  } else {
    console.log(`[DEV] Welcome email for ${email} — temp password: ${password}`);
  }

  return NextResponse.json(user, { status: 201 });
}
