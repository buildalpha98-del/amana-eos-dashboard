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
  role: z.enum(["owner", "admin", "member"]).default("member"),
});

// GET /api/users — list all users (owner only)
export async function GET() {
  const { session, error } = await requireAuth(["owner"]);
  if (error) return error;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      avatar: true,
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

  const { name, email, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await hash(password, 12);

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
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
      details: { name: user.name, email: user.email, role: user.role },
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
