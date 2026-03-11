import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { checkApiKeyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/cowork/recruitment — List open vacancies
 * Auth: API key with "recruitment:read" scope
 */
export async function GET(req: NextRequest) {
  const { apiKey, error: authError } = await authenticateApiKey(req, "recruitment:read");
  if (authError) return authError;

  const { limited, resetIn } = await checkApiKeyRateLimit(apiKey!.id);
  if (limited) {
    return NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(resetIn / 1000)) } },
    );
  }

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  const where: Record<string, unknown> = { deleted: false, status: "open" };
  if (serviceId) where.serviceId = serviceId;

  const vacancies = await prisma.recruitmentVacancy.findMany({
    where,
    include: {
      service: { select: { id: true, name: true, code: true } },
      _count: { select: { candidates: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ vacancies });
}

/**
 * POST /api/cowork/recruitment — Create a vacancy
 * Auth: API key with "recruitment:write" scope
 */
export async function POST(req: NextRequest) {
  const { apiKey, error: authError } = await authenticateApiKey(req, "recruitment:write");
  if (authError) return authError;

  const { limited, resetIn } = await checkApiKeyRateLimit(apiKey!.id);
  if (limited) {
    return NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(resetIn / 1000)) } },
    );
  }

  try {
    const body = await req.json();
    const { serviceId, role, employmentType, qualificationRequired, notes } = body;

    if (!serviceId || !role || !employmentType) {
      return NextResponse.json(
        { error: "serviceId, role, and employmentType are required" },
        { status: 400 }
      );
    }

    const vacancy = await prisma.recruitmentVacancy.create({
      data: {
        serviceId,
        role,
        employmentType,
        qualificationRequired: qualificationRequired || null,
        notes: notes || null,
        postedChannels: [],
      },
      include: {
        service: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json(vacancy, { status: 201 });
  } catch (err) {
    console.error("Cowork recruitment POST error:", err);
    return NextResponse.json({ error: "Failed to create vacancy" }, { status: 500 });
  }
}
