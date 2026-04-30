import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const triggerSchema = z.object({
  serviceId: z.string().min(1),
  contactId: z.string().optional().nullable(),
  childName: z.string().min(1, "Child name is required"),
  withdrawalDate: z.string().optional(), // ISO date
  contactEmail: z.string().email().optional().nullable(),
});

// POST /api/exit-survey/trigger — creates exit survey + sends email
export const POST = withApiAuth(async (req) => {
  const body = await parseJsonBody(req);

  let data: z.infer<typeof triggerSchema>;
  try {
    data = triggerSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw ApiError.badRequest(err.issues[0].message);
    }
    throw err;
  }

  // Verify service
  const service = await prisma.service.findUnique({
    where: { id: data.serviceId },
    select: { id: true, name: true },
  });
  if (!service) {
    throw ApiError.notFound("Service not found");
  }

  // Generate unique token
  const surveyToken = randomBytes(32).toString("hex");
  const tokenExpiresAt = new Date();
  tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30); // 30-day expiry

  const withdrawalDate = data.withdrawalDate ? new Date(data.withdrawalDate) : new Date();

  const survey = await prisma.exitSurvey.create({
    data: {
      serviceId: data.serviceId,
      contactId: data.contactId || null,
      childName: data.childName,
      withdrawalDate,
      reason: "other", // placeholder until completed
      satisfactionScore: 3, // placeholder
      wouldReturn: "maybe", // placeholder
      surveyToken,
      tokenExpiresAt,
    },
  });

  // Update contact status if contactId provided
  if (data.contactId) {
    await prisma.centreContact.update({
      where: { id: data.contactId },
      data: {
        status: "withdrawn",
        withdrawalDate,
        withdrawalReason: "exit_survey_triggered",
      },
    }).catch((err) => logger.error("Failed to mark contact as withdrawn for exit survey", { err, contactId: data.contactId }));
  }

  const surveyUrl = `${process.env.NEXTAUTH_URL || "https://amanaoshc.company"}/survey/exit/${surveyToken}`;

  // Send exit survey email if email available
  if (data.contactEmail) {
    try {
      const { Resend } = await import("resend");
      const { nurtureExitSurveyEmail } = await import("@/lib/email-templates");
      const resend = new Resend(process.env.RESEND_API_KEY);

      // Find contact first name
      let firstName = "Parent";
      if (data.contactId) {
        const contact = await prisma.centreContact.findUnique({
          where: { id: data.contactId },
          select: { firstName: true },
        });
        if (contact?.firstName) firstName = contact.firstName;
      }

      const emailContent = nurtureExitSurveyEmail(firstName, service.name, surveyUrl);
      await resend.emails.send({
        from: "Amana OSHC <noreply@amanaoshc.com.au>",
        to: data.contactEmail,
        subject: emailContent.subject,
        html: emailContent.html,
      });
    } catch (emailErr) {
      logger.error("ExitSurvey: Email send failed", { err: emailErr });
    }
  }

  return NextResponse.json({
    id: survey.id,
    surveyUrl,
    surveyToken,
    expiresAt: tokenExpiresAt,
  }, { status: 201 });
}, { roles: ["owner", "head_office", "admin"] });
