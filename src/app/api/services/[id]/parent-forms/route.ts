/**
 * Staff side of parent forms — the permission slips and policy
 * acknowledgements a centre needs signatures on.
 *
 * GET  → the service's forms, newest first, with signature counts.
 * POST → publish a form. Every family at the centre gets a bell
 *        notification; signing happens in the parent portal.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { isTrustedBlobUrl } from "@/lib/trusted-urls";

const ORG_WIDE_ROLES = new Set(["owner", "head_office", "admin", "eos"]);

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  fileUrl: z
    .string()
    .url()
    .refine(isTrustedBlobUrl, {
      message: "fileUrl must come from our upload endpoint",
    })
    .optional(),
  fileName: z.string().max(200).optional(),
  /** YYYY-MM-DD. Informational — a late signature still counts. */
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** One signature per child (CWA shape) rather than per family. */
  perChild: z.boolean().optional(),
});

function assertServiceAccess(
  session: { user: { role: string; serviceId?: string | null } },
  serviceId: string,
) {
  if (
    !ORG_WIDE_ROLES.has(session.user.role) &&
    session.user.serviceId !== serviceId
  ) {
    throw ApiError.forbidden("You do not have access to this service");
  }
}

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  assertServiceAccess(session as never, id);

  const forms = await prisma.parentForm.findMany({
    where: { serviceId: id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { signatures: true } },
      createdBy: { select: { name: true } },
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
      status: f.status,
      createdAt: f.createdAt,
      createdBy: f.createdBy?.name ?? null,
      signatureCount: f._count.signatures,
    })),
  });
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const parsed = createSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const d = parsed.data;

    const form = await prisma.parentForm.create({
      data: {
        serviceId: id,
        title: d.title,
        description: d.description || null,
        fileUrl: d.fileUrl || null,
        fileName: d.fileName || null,
        dueDate: d.dueDate ? new Date(`${d.dueDate}T00:00:00.000Z`) : null,
        perChild: d.perChild ?? false,
        createdById: session!.user.id,
      },
    });

    // Tell the families. The bell, not a push — a form is important but
    // rarely urgent, and the push channel stays reserved for things
    // that can't wait (see notifications/posts.ts for the reasoning).
    void (async () => {
      try {
        const contacts = await prisma.centreContact.findMany({
          where: { serviceId: id, status: "active" },
          select: { email: true },
        });
        if (contacts.length > 0) {
          await prisma.parentNotification.createMany({
            data: contacts.map((c) => ({
              parentEmail: c.email.toLowerCase().trim(),
              type: "form",
              title: "A form needs your signature",
              body: d.title,
              link: "/parent/my-centre?tab=documents",
            })),
          });
        }
      } catch (err) {
        logger.error("parent form fan-out failed", { formId: form.id, err });
      }
    })();

    logger.info("Parent form published", {
      formId: form.id,
      serviceId: id,
      userId: session!.user.id,
    });

    return NextResponse.json(form, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
