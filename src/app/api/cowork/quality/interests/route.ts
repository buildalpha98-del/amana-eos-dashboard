import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";

import { parseJsonBody } from "@/lib/api-error";
const INTEREST_SOURCES = ["interest_book", "verbal", "observation", "parent", "suggestion_box"] as const;

const batchCreateSchema = z.object({
  serviceCode: z.string().min(1),
  interests: z.array(
    z.object({
      childName: z.string().max(100).optional(),
      interestTopic: z.string().min(1).max(300),
      interestCategory: z.string().max(50).optional(),
      source: z.enum(INTEREST_SOURCES),
      notes: z.string().max(1000).optional(),
    }),
  ).min(1).max(50),
});

// GET /api/cowork/quality/interests?serviceCode=xxx — read unactioned interests for programme generation
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const serviceCode = url.searchParams.get("serviceCode");

  // If serviceCode specified, return interests for that centre
  // Otherwise return all unactioned interests grouped by centre
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  if (serviceCode) {
    const service = await prisma.service.findFirst({
      where: { code: serviceCode },
      select: { id: true, name: true, code: true },
    });
    if (!service) {
      return NextResponse.json({ error: `Service "${serviceCode}" not found` }, { status: 404 });
    }

    const interests = await prisma.childInterest.findMany({
      where: {
        serviceId: service.id,
        actioned: false,
        capturedDate: { gte: twoWeeksAgo },
      },
      orderBy: { capturedDate: "desc" },
      take: 20,
    });

    return NextResponse.json({
      service: { code: service.code, name: service.name },
      unactionedInterests: interests.map((i) => ({
        id: i.id,
        childName: i.childName,
        interestTopic: i.interestTopic,
        interestCategory: i.interestCategory,
        source: i.source,
        capturedDate: i.capturedDate,
      })),
      topTopics: getTopTopics(interests),
    });
  }

  // All centres: grouped summary
  const services = await prisma.service.findMany({
    where: { status: "active" },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  const results = await Promise.all(
    services.map(async (s) => {
      const interests = await prisma.childInterest.findMany({
        where: {
          serviceId: s.id,
          actioned: false,
          capturedDate: { gte: twoWeeksAgo },
        },
        select: { interestTopic: true, interestCategory: true },
      });

      return {
        service: { code: s.code, name: s.name },
        unactionedCount: interests.length,
        topTopics: getTopTopics(interests),
      };
    }),
  );

  return NextResponse.json({ centres: results });
});

// POST /api/cowork/quality/interests — batch capture interests
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const body = await parseJsonBody(req);
  const parsed = batchCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { serviceCode, interests } = parsed.data;

  const service = await prisma.service.findFirst({
    where: { code: serviceCode },
    select: { id: true, name: true, code: true },
  });
  if (!service) {
    return NextResponse.json({ error: `Service "${serviceCode}" not found` }, { status: 404 });
  }

  const created = await prisma.childInterest.createMany({
    data: interests.map((i) => ({
      serviceId: service.id,
      childName: i.childName || null,
      interestTopic: i.interestTopic,
      interestCategory: i.interestCategory || null,
      source: i.source,
      notes: i.notes || null,
      capturedById: "cowork",
    })),
  });

  return NextResponse.json(
    {
      service: { code: service.code, name: service.name },
      created: created.count,
    },
    { status: 201 },
  );
});

// Helper: extract top topics from interest list
function getTopTopics(
  interests: { interestTopic: string; interestCategory?: string | null }[],
): string[] {
  const counts: Record<string, number> = {};
  for (const i of interests) {
    const topic = i.interestTopic.toLowerCase().trim();
    counts[topic] = (counts[topic] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);
}
