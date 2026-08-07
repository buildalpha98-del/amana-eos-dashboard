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
  /** Required when the form is per-child (CWA, medical consent). */
  childId: z.string().min(1).optional(),
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

async function familyContext(enrolmentIds: string[]) {
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: enrolmentIds }, status: { not: "draft" } },
    select: {
      serviceId: true,
      childRecords: {
        where: { status: { not: "withdrawn" } },
        select: { id: true, firstName: true, serviceId: true },
      },
    },
  });
  const serviceIds = new Set<string>();
  const children: { id: string; firstName: string; serviceId: string | null }[] = [];
  for (const e of enrolments) {
    if (e.serviceId) serviceIds.add(e.serviceId);
    for (const c of e.childRecords) {
      if (c.serviceId) serviceIds.add(c.serviceId);
      children.push(c);
    }
  }
  return { serviceIds: [...serviceIds], children };
}

export const GET = withParentAuth(async (_req, { parent }) => {
  const { serviceIds, children } = await familyContext(parent.enrolmentIds);
  if (serviceIds.length === 0)
    return NextResponse.json({ forms: [], children: [] });

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
        select: { signedName: true, signedAt: true, childId: true },
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
      perChild: f.perChild,
      serviceName: f.service.name,
      // Family-level: at most one row. Per-child: one per signed child.
      signed: f.perChild ? null : (f.signatures.find((x) => !x.childId) ?? null),
      signatures: f.signatures,
    })),
    // For per-child forms the client needs to render one sign action per
    // child at that centre.
    children,
  });
});

export const POST = withParentAuth(async (req, { parent }) => {
  const parsed = signSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues[0].message);
  }
  const { formId, childId, signedName } = parsed.data;
  const email = parent.email.toLowerCase().trim();

  const form = await prisma.parentForm.findUnique({
    where: { id: formId },
    select: { id: true, serviceId: true, status: true, perChild: true },
  });
  if (!form || form.status !== "active") {
    throw ApiError.notFound("This form isn't available any more.");
  }

  // The family must actually belong to the form's centre — otherwise a
  // guessed id lets anyone sign anything.
  const { serviceIds, children } = await familyContext(parent.enrolmentIds);
  if (!serviceIds.includes(form.serviceId)) {
    throw ApiError.forbidden("This form belongs to a different centre.");
  }

  // Per-child forms (a CWA, a medical consent) are signed FOR a child,
  // and only one of this family's own children at that centre.
  if (form.perChild) {
    const child = children.find((c) => c.id === childId);
    if (!childId || !child) {
      throw ApiError.badRequest("Choose which child you're signing for.");
    }
    if (child.serviceId !== form.serviceId) {
      throw ApiError.badRequest(
        "This form belongs to a different centre to that child.",
      );
    }
  }

  // Signing twice keeps the FIRST signature: the original timestamp is
  // the legally interesting one, and a re-tap must not rewrite it. The
  // uniqueness itself is guarded by partial indexes in the database, so
  // a race between two taps still can't produce two rows.
  const effectiveChildId = form.perChild ? childId! : null;
  const existing = await prisma.parentFormSignature.findFirst({
    where: { formId, parentEmail: email, childId: effectiveChildId },
  });
  if (existing) return NextResponse.json({ ok: true, signature: existing });

  const signature = await prisma.parentFormSignature.create({
    data: { formId, parentEmail: email, signedName, childId: effectiveChildId },
  });

  return NextResponse.json({ ok: true, signature });
});
