import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { getNextTerm } from "@/lib/school-terms";

const bodySchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  contactEmail: z.string().email().optional(),
  contactName: z.string().max(200).optional(),
  termYear: z.number().int().min(2020).max(2100).optional(),
  termNumber: z.number().int().min(1).max(4).optional(),
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const params = await context?.params;
    const serviceId = params?.serviceId;
    if (!serviceId) throw ApiError.badRequest("serviceId required");

    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, name: true },
    });
    if (!service) throw ApiError.notFound("Service not found");

    const next = getNextTerm(new Date());
    const year = parsed.data.termYear ?? next.year;
    const term = parsed.data.termNumber ?? next.term;

    const created = await prisma.schoolComm.create({
      data: {
        serviceId,
        type: "newsletter",
        subject: parsed.data.subject,
        body: parsed.data.body,
        schoolName: parsed.data.contactName ?? null,
        contactEmail: parsed.data.contactEmail ?? null,
        status: "sent",
        sentAt: new Date(),
        sentById: session.user.id,
        year,
        term,
      },
      select: { id: true, sentAt: true, year: true, term: true },
    });

    return NextResponse.json({
      schoolCommId: created.id,
      sentAt: created.sentAt?.toISOString() ?? null,
      year: created.year,
      term: created.term,
    }, { status: 201 });
  },
  { roles: ["marketing", "owner"] },
);
