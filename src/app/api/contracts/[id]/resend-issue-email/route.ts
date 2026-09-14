import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { sendEmail } from "@/lib/email";
import { contractIssuedEmail } from "@/lib/email-templates/contracts";

export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;

    const contract = await prisma.employmentContract.findUnique({
      where: { id },
    });
    if (!contract) throw ApiError.notFound("Contract not found");
    if (!contract.documentUrl) throw ApiError.badRequest("Contract has no issued document — cannot resend email");

    const staff = await prisma.user.findUniqueOrThrow({
      where: { id: contract.userId },
      select: { email: true, name: true },
    });

    // Fetch template name if available for a friendlier email body
    let templateName = "Employment Contract";
    if (contract.templateId) {
      const template = await prisma.contractTemplate.findUnique({
        where: { id: contract.templateId },
        select: { name: true },
      });
      if (template) templateName = template.name;
    }

    // /my-contract opens the viewer for this exact contract. It used to
    // point at /my-portal?contract=<id>, but that page never read the
    // query param — staff landed on the hub and had to hunt for the card.
    const portalUrl = `${process.env.NEXTAUTH_URL ?? ""}/my-contract?contract=${contract.id}`;
    const { subject, html } = await contractIssuedEmail({
      name: staff.name ?? "there",
      contractName: templateName,
      portalUrl,
      pdfUrl: contract.documentUrl,
    });
    await sendEmail({ to: staff.email, subject, html });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "resend_issue_email",
        entityType: "EmploymentContract",
        entityId: contract.id,
      },
    });

    return NextResponse.json({ ok: true });
  },
  {
    roles: ["owner", "admin"],
    feature: "contracts.create",
  },
);
