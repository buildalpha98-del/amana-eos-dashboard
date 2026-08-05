/**
 * PATCH — archive or reopen a form; DELETE is deliberately absent.
 *
 * A signed form is a record of consent. Deleting one would delete the
 * evidence that families agreed to something, which is exactly the
 * document you need the day someone disputes it. Archiving hides it
 * from the portal and keeps every signature.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const ORG_WIDE_ROLES = new Set(["owner", "head_office", "admin", "eos"]);

const patchSchema = z.object({
  status: z.enum(["active", "archived"]),
});

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id, formId } = (await context!.params!) as {
      id: string;
      formId: string;
    };

    if (
      !ORG_WIDE_ROLES.has(session!.user.role) &&
      session!.user.serviceId !== id
    ) {
      throw ApiError.forbidden("You do not have access to this service");
    }

    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }

    const form = await prisma.parentForm.findUnique({
      where: { id: formId },
      select: { id: true, serviceId: true },
    });
    if (!form || form.serviceId !== id) {
      throw ApiError.notFound("Form not found");
    }

    const updated = await prisma.parentForm.update({
      where: { id: formId },
      data: { status: parsed.data.status },
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
