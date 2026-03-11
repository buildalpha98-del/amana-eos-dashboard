import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { pulseSurveyEmail } from "@/lib/email-templates";

export async function GET(req: NextRequest) {
  // 1. Auth
  const authCheck = verifyCronSecret(req);
  if (authCheck) return authCheck.error;

  // 2. Idempotency
  const guard = await acquireCronLock("staff-pulse", "monthly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // 3. Get all active staff with a service
    const activeStaff = await prisma.user.findMany({
      where: {
        active: true,
        serviceId: { not: null },
      },
      select: {
        id: true,
        name: true,
        email: true,
        serviceId: true,
      },
    });

    let created = 0;
    let skipped = 0;
    let emailsSent = 0;
    const errors: string[] = [];

    const resend = getResend();
    const dashboardUrl =
      process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

    for (const staff of activeStaff) {
      // Check if survey already exists for this period
      const existing = await prisma.staffPulseSurvey.findUnique({
        where: {
          userId_periodMonth: {
            userId: staff.id,
            periodMonth,
          },
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Create blank survey
      await prisma.staffPulseSurvey.create({
        data: {
          userId: staff.id,
          serviceId: staff.serviceId!,
          periodMonth,
        },
      });
      created++;

      // Send email notification
      if (resend) {
        try {
          const firstName = staff.name.split(" ")[0];
          const { subject, html } = pulseSurveyEmail(
            firstName,
            periodMonth,
            `${dashboardUrl}/my-portal`,
          );

          await resend.emails.send({
            from: FROM_EMAIL,
            to: staff.email,
            subject,
            html,
          });
          emailsSent++;
        } catch (err) {
          errors.push(
            `Failed ${staff.email}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    await guard.complete({
      periodMonth,
      totalStaff: activeStaff.length,
      created,
      skipped,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });

    return NextResponse.json({
      message: "Staff pulse surveys created",
      periodMonth,
      created,
      skipped,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    console.error("Staff pulse cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
}
