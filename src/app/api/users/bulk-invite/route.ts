import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { welcomeEmail } from "@/lib/email-templates";
import { logAuditEvent } from "@/lib/audit-log";
import { withApiAuth } from "@/lib/server-auth";

const bulkUserSchema = z.object({
  email: z.string().email("Valid email is required"),
  name: z.string().min(1, "Name is required"),
  role: z
    .enum([
      "owner",
      "head_office",
      "admin",
      "marketing",
      "coordinator",
      "member",
      "staff",
    ])
    .default("member"),
  serviceIds: z.array(z.string()).optional(),
});

const bulkInviteSchema = z.object({
  users: z.array(bulkUserSchema).min(1).max(500),
});

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;

  // Use cryptographically secure randomness
  const randomBytes = new Uint8Array(12);
  crypto.getRandomValues(randomBytes);

  // Ensure at least one of each required type
  let pwd = "";
  pwd += upper[randomBytes[0] % upper.length];
  pwd += lower[randomBytes[1] % lower.length];
  pwd += digits[randomBytes[2] % digits.length];
  pwd += special[randomBytes[3] % special.length];

  // Fill remaining 8 chars
  for (let i = 0; i < 8; i++) {
    pwd += all[randomBytes[4 + i] % all.length];
  }

  // Shuffle using Fisher-Yates with crypto randomness
  const shuffleBytes = new Uint8Array(pwd.length);
  crypto.getRandomValues(shuffleBytes);
  const arr = pwd.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = shuffleBytes[i] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

const BATCH_SIZE = 10;

export const POST = withApiAuth(async (req, session) => {
  const callerRole = session.user.role;

  // Guard: only owner/admin/head_office can bulk invite
  if (!["owner", "admin", "head_office"].includes(callerRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = bulkInviteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const { users } = parsed.data;

  // Guard: non-owners cannot create owner-level users
  if (callerRole !== "owner" && users.some((u) => u.role === "owner")) {
    return NextResponse.json(
      { error: "Only owners can create other owner accounts." },
      { status: 403 },
    );
  }

  // Load existing emails to detect duplicates
  const existingEmails = new Set(
    (await prisma.user.findMany({ select: { email: true } })).map((u) =>
      u.email.toLowerCase(),
    ),
  );

  // Load services for serviceId resolution
  const services = await prisma.service.findMany({
    select: { id: true, name: true, code: true },
  });
  const serviceMap = new Map(services.map((s) => [s.id, s]));

  const created: Array<{ email: string; name: string; role: string }> = [];
  const skipped: Array<{ email: string; reason: string }> = [];
  const errors: Array<{ email: string; error: string }> = [];

  const loginUrl = `${process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au"}/login`;

  // Process users in batches
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (userData) => {
        const email = userData.email.toLowerCase().trim();
        const name = userData.name.trim();

        // Skip duplicates (existing in DB or earlier in this batch)
        if (existingEmails.has(email)) {
          skipped.push({ email, reason: "Email already exists" });
          return;
        }

        // Mark as seen to prevent duplicates within the same request
        existingEmails.add(email);

        // Resolve serviceId — take first if provided
        const serviceId =
          userData.serviceIds?.[0] &&
          serviceMap.has(userData.serviceIds[0])
            ? userData.serviceIds[0]
            : null;

        const tempPassword = generateTempPassword();
        const passwordHash = await hash(tempPassword, 12);

        const user = await prisma.user.create({
          data: {
            name,
            email,
            passwordHash,
            role: userData.role,
            serviceId:
              userData.role === "staff" || userData.role === "member"
                ? serviceId
                : null,
          },
        });

        // Log activity
        await prisma.activityLog.create({
          data: {
            userId: session.user.id,
            action: "create",
            entityType: "User",
            entityId: user.id,
            details: {
              name,
              email,
              role: userData.role,
              serviceId,
              bulkInvite: true,
            },
          },
        });

        logAuditEvent(
          {
            action: "user.bulk_invited",
            actorId: session.user.id,
            actorEmail: session.user.email,
            targetId: user.id,
            targetType: "User",
            metadata: { role: userData.role, email },
          },
          req,
        );

        // Seed onboarding todos + welcome announcement
        const { seedOnboardingPackage } = await import("@/lib/onboarding-seed");
        await seedOnboardingPackage(user.id, { serviceId });

        // Send welcome email
        try {
          const { subject, html } = welcomeEmail(
            name.split(" ")[0],
            tempPassword,
            loginUrl,
          );
          await sendEmail({ to: email, subject, html });
        } catch (emailErr) {
          logger.warn("Welcome email failed", { email, err: emailErr });
          // Don't fail user creation if email fails
        }

        created.push({ email, name, role: userData.role });
      }),
    );

    // Collect any rejected promises as errors
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "rejected") {
        const userData = batch[j];
        const email = userData.email.toLowerCase().trim();
        // Check if already in skipped (duplicate handling)
        if (!skipped.some((s) => s.email === email)) {
          errors.push({
            email,
            error:
              result.reason instanceof Error
                ? result.reason.message
                : "Unknown error",
          });
        }
      }
    }
  }

  return NextResponse.json({
    created: created.length,
    skipped,
    errors,
  });
});
