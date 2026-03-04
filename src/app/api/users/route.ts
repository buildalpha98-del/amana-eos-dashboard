import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { welcomeEmail } from "@/lib/email-templates";

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["owner", "admin", "member", "staff"]).default("member"),
  serviceId: z.string().optional().nullable(),
});

// GET /api/users — list all users (any authenticated user)
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      avatar: true,
      serviceId: true,
      service: { select: { id: true, name: true, code: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(users);
}

// POST /api/users — create a new user (owner only)
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { name, email, password, role, serviceId } = parsed.data;

  // Validate: staff role requires a serviceId
  if (role === "staff" && !serviceId) {
    return NextResponse.json(
      { error: "Staff members must be assigned to a service/centre" },
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
      serviceId: role === "staff" ? serviceId : null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      serviceId: true,
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
