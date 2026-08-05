/**
 * GET — the full signature record for one form: who signed, for which
 * child, when, and who is still owing.
 *
 * This feeds the downloadable signature record (a branded PDF for the
 * compliance folder). Works for archived forms too — archiving hides a
 * form from families; the evidence stays reachable here.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

const ORG_WIDE_ROLES = new Set(["owner", "head_office", "admin", "eos"]);

export const GET = withApiAuth(
  async (_req, session, context) => {
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

    const form = await prisma.parentForm.findUnique({
      where: { id: formId },
      include: {
        service: { select: { name: true } },
        signatures: {
          orderBy: { signedAt: "asc" },
          include: {
            child: { select: { firstName: true, surname: true } },
          },
        },
      },
    });
    if (!form || form.serviceId !== id) {
      throw ApiError.notFound("Form not found");
    }

    // Who's still owing. For a family form: active contacts whose email
    // has no signature. For a per-child form: children at this centre
    // without their own row.
    let outstanding: string[] = [];
    if (form.perChild) {
      const children = await prisma.child.findMany({
        where: { serviceId: id },
        select: { id: true, firstName: true, surname: true },
      });
      const signedChildIds = new Set(
        form.signatures.map((s) => s.childId).filter(Boolean),
      );
      outstanding = children
        .filter((c) => !signedChildIds.has(c.id))
        .map((c) => `${c.firstName} ${c.surname}`.trim());
    } else {
      const contacts = await prisma.centreContact.findMany({
        where: { serviceId: id, status: "active" },
        select: { email: true, firstName: true, lastName: true },
      });
      const signedEmails = new Set(
        form.signatures.map((s) => s.parentEmail.toLowerCase()),
      );
      outstanding = contacts
        .filter((c) => !signedEmails.has(c.email.toLowerCase().trim()))
        .map((c) =>
          [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
          c.email,
        );
    }

    return NextResponse.json({
      form: {
        id: form.id,
        title: form.title,
        description: form.description,
        dueDate: form.dueDate,
        perChild: form.perChild,
        status: form.status,
        createdAt: form.createdAt,
        serviceName: form.service.name,
      },
      signatures: form.signatures.map((s) => ({
        signedName: s.signedName,
        parentEmail: s.parentEmail,
        signedAt: s.signedAt,
        childName: s.child
          ? `${s.child.firstName} ${s.child.surname}`.trim()
          : null,
      })),
      outstanding,
    });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
