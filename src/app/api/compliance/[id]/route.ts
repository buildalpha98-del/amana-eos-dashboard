import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const updateCertSchema = z.object({
  type: z.enum(["wwcc", "first_aid", "anaphylaxis", "asthma", "cpr", "police_check", "annual_review", "other"]).optional(),
  label: z.string().nullable().optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  notes: z.string().nullable().optional(),
  alertDays: z.number().optional(),
  acknowledged: z.boolean().optional(),
});

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = updateCertSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.issueDate) data.issueDate = new Date(parsed.data.issueDate);
  if (parsed.data.expiryDate) data.expiryDate = new Date(parsed.data.expiryDate);

  const cert = await prisma.complianceCertificate.update({
    where: { id },
    data,
    include: {
      service: { select: { id: true, name: true, code: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(cert);
}, { roles: ["owner", "head_office", "admin"] });

export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  await prisma.complianceCertificate.delete({ where: { id } });
  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });
