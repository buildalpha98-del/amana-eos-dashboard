import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/px/nps
 * Record NPS survey responses and auto-categorise.
 * Used by: px-nps-analysis, px-detractor-recovery, px-satisfaction-trend
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { serviceCode, responses } = body;

    if (!serviceCode || !responses || !Array.isArray(responses)) {
      return NextResponse.json(
        {
          error: "Bad Request",
          message: "serviceCode and responses[] required",
        },
        { status: 400 }
      );
    }

    const service = await prisma.service.findUnique({
      where: { code: serviceCode },
      select: { id: true, name: true },
    });

    if (!service) {
      return NextResponse.json(
        { error: "Not Found", message: `Service ${serviceCode} not found` },
        { status: 404 }
      );
    }

    let created = 0;
    const detractors: { name: string; score: number; comment: string }[] = [];

    for (const resp of responses) {
      // Upsert the contact
      const contact = await prisma.centreContact.upsert({
        where: {
          email_serviceId: { email: resp.email, serviceId: service.id },
        },
        update: {
          firstName: resp.firstName || undefined,
          lastName: resp.lastName || undefined,
        },
        create: {
          email: resp.email,
          serviceId: service.id,
          firstName: resp.firstName || null,
          lastName: resp.lastName || null,
        },
      });

      // Categorise
      let category: string;
      if (resp.score >= 9) category = "promoter";
      else if (resp.score >= 7) category = "passive";
      else category = "detractor";

      if (category === "detractor") {
        detractors.push({
          name: resp.firstName || resp.email,
          score: resp.score,
          comment: resp.comment || "",
        });
      }

      await prisma.npsSurveyResponse.create({
        data: {
          serviceId: service.id,
          contactId: contact.id,
          score: resp.score,
          comment: resp.comment || null,
          category,
          followUpStatus: category === "detractor" ? "pending" : "resolved",
          respondedAt: resp.respondedAt
            ? new Date(resp.respondedAt)
            : new Date(),
        },
      });
      created++;
    }

    // Auto-create follow-up todos for detractors
    if (detractors.length > 0) {
      await prisma.coworkTodo.create({
        data: {
          centreId: serviceCode,
          date: new Date(),
          category: "parent_experience",
          title: `Follow up on ${detractors.length} NPS detractor(s) — ${service.name}`,
          description: detractors
            .map(
              (d) =>
                `- ${d.name} (score: ${d.score}): ${d.comment || "No comment"}`
            )
            .join("\n"),
        },
      });
    }

    return NextResponse.json(
      {
        message: "NPS responses recorded",
        serviceCode,
        created,
        detractorCount: detractors.length,
        followUpCreated: detractors.length > 0,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /cowork/px/nps]", err);
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
}
