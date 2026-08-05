/**
 * Parent side of forms.
 *
 * GET  → active forms at the family's centre(s), with whether THIS
 *        family has signed each.
 * POST → sign one: a typed full name, the same convention the enrolment
 *        form uses. One signature per family per form — signing again
 *        returns the existing signature rather than erroring, because a
 *        double-tap is not a dispute.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const signSchema = z.object({
  formId: z.string().min(1),
  /**
   * Two parts minimum. A single letter is a tap, not a signature — and
   * this row may one day be read out in a dispute about consent.
   */
  signedName: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((v) => v.split(/\s+/).length >= 2, {
      message: "Please sign with your full name.",
    }),
});

async function familyServiceIds(enrolmentIds: string[]): Promise<string[]> {
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: enrolmentIds }, status: { not: "draft" } },
    select: { serviceId: true, childRecords: { select: { serviceId: true } } },
  });
  const ids = new Set<string>();
  for (const e of enrolments) {
    if (e.serviceId) ids.add(e.serviceId);
    for (const c of e.childRecords) if (c.serviceId) ids.add(c.serviceId);
  }
  return [...ids];
}

export const GET = withParentAuth(async (_req, { parent }) => {
  const serviceIds = await familyServiceIds(parent.enrolmentIds);
  if (serviceIds.length === 0) return NextResponse.json({ forms: [] });

  const email = parent.email.toLowerCase().trim();
  const forms = await prisma.parentForm.findMany({
    where: { serviceId: { in: serviceIds }, status: "active" },
    orderBy: { createdAt: "desc" },
    include: {
      service: { select: { name: true } },
      // Only THIS family's signature travels to the client — who else
      // has signed is the centre's business, not the neighbours'.
      signatures: {
        where: { parentEmail: email },
        select: { signedName: true, signedAt: true },
      },
    },
  });

  return NextResponse.json({
    forms: forms.map((f) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      fileUrl: f.fileUrl,
      fileName: f.fileName,
      dueDate: f.dueDate,
      serviceName: f.service.name,
      signed: f.signatures[0] ?? null,
    })),
  });
});

export const POST = withParentAuth(async (req, { parent }) => {
  const parsed = signSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues[0].message);
  }
  const { formId, signedName } = parsed.data;
  const email = parent.email.toLowerCase().trim();

  const form = await prisma.parentForm.findUnique({
    where: { id: formId },
    select: { id: true, serviceId: true, status: true },
  });
  if (!form || form.status !== "active") {
    throw ApiError.notFound("This form isn't available any more.");
  }

  // The family must actually belong to the form's centre — otherwise a
  // guessed id lets anyone sign anything.
  const serviceIds = await familyServiceIds(parent.enrolmentIds);
  if (!serviceIds.includes(form.serviceId)) {
    throw ApiError.forbidden("This form belongs to a different centre.");
  }

  const signature = await prisma.parentFormSignature.upsert({
    where: { formId_parentEmail: { formId, parentEmail: email } },
    // Signing twice keeps the FIRST signature: the original timestamp is
    // the legally interesting one, and a re-tap must not rewrite it.
    update: {},
    create: { formId, parentEmail: email, signedName },
  });

  return NextResponse.json({ ok: true, signature });
});
