import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { uploadFile } from "@/lib/storage";
import { resolveTemplateData } from "@/lib/contract-templates/resolve-data";
import { renderTemplateHtml, type TipTapDoc } from "@/lib/contract-templates/render-html";
import { renderContractPdf } from "@/lib/pdf/render-contract";
import { sendEmail } from "@/lib/email";

// IMPORTANT: AwardLevel and ContractType enum values must mirror the
// canonical Prisma enums in prisma/schema.prisma. AwardLevel pay-grade
// 'coordinator' is intentionally retained despite the role being dropped.
const issueSchema = z.object({
  templateId: z.string().min(1),
  userId: z.string().min(1),
  contractMeta: z.object({
    contractType: z.enum(["ct_casual", "ct_part_time", "ct_permanent", "ct_fixed_term"]),
    awardLevel: z
      .enum(["es1", "es2", "es3", "es4", "cs1", "cs2", "cs3", "cs4", "director", "coordinator", "custom"])
      .nullish(),
    awardLevelCustom: z.string().nullish(),
    payRate: z.number().positive(),
    hoursPerWeek: z.number().positive().nullish(),
    startDate: z.string(),
    endDate: z.string().nullish(),
    position: z.string().min(1),
  }),
  manualValues: z.record(z.string(), z.string()),
});

export const POST = withApiAuth(
  async (req, session) => {
    const body = await parseJsonBody(req);
    const parsed = issueSchema.safeParse(body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    const data = parsed.data;

    const template = await prisma.contractTemplate.findUnique({ where: { id: data.templateId } });
    if (!template) throw ApiError.notFound("Template not found");
    if (template.status === "disabled") throw ApiError.badRequest("Template is disabled");

    const startDate = new Date(data.contractMeta.startDate);
    const endDate = data.contractMeta.endDate ? new Date(data.contractMeta.endDate) : null;

    // Step 4: resolve auto tags — blocks on missing required staff fields
    const { resolved, missingBlocking } = await resolveTemplateData({
      userId: data.userId,
      contractMeta: {
        ...data.contractMeta,
        startDate,
        endDate,
        position: data.contractMeta.position,
      },
    });
    if (missingBlocking.length) {
      throw ApiError.badRequest(`Missing required staff fields: ${missingBlocking.join(", ")}`);
    }

    // Step 5: render HTML — merge auto + manual; unknown tags fail here
    const allData = { ...resolved, ...data.manualValues };
    const { html, missingTags } = renderTemplateHtml({
      doc: template.contentJson as TipTapDoc,
      data: allData,
    });
    if (missingTags.length) {
      throw ApiError.badRequest(`Template references unknown tags: ${missingTags.join(", ")}`);
    }

    // Steps 6-7: render PDF + upload.
    // Failure here means no DB row (clean abort — no orphan storage).
    const pdf = await renderContractPdf(html);
    const { url } = await uploadFile(pdf, `contract-${data.userId}-${Date.now()}.pdf`, {
      contentType: "application/pdf",
      folder: "contracts/issued",
    });

    // NOTE on documentId: we do NOT create a `Document` row for issued
    // contracts. The Document model is for the dashboard's general
    // document library (with centreId, tags, folderId, etc.) and creating
    // a row per issued contract would pollute that library. The blob URL
    // is the source of truth and is fetched directly. EmploymentContract
    // .documentId remains null in v1.
    const contract = await prisma.$transaction(async (tx) => {
      const created = await tx.employmentContract.create({
        data: {
          userId: data.userId,
          contractType: data.contractMeta.contractType,
          awardLevel: data.contractMeta.awardLevel ?? null,
          awardLevelCustom: data.contractMeta.awardLevelCustom ?? null,
          payRate: data.contractMeta.payRate,
          hoursPerWeek: data.contractMeta.hoursPerWeek ?? null,
          startDate,
          endDate,
          status: "active",
          documentUrl: url,
          documentId: null,
          templateId: template.id,
          templateValues: { auto: resolved, manual: data.manualValues },
        },
      });
      await tx.activityLog.create({
        data: {
          userId: session!.user.id,
          action: "issue_from_template",
          entityType: "EmploymentContract",
          entityId: created.id,
          details: { templateId: template.id, templateName: template.name },
        },
      });
      return created;
    });

    // Step 9: send email — OUTSIDE the transaction.
    // Email failure must NOT roll back the contract row.
    let emailFailed = false;
    try {
      const staff = await prisma.user.findUniqueOrThrow({
        where: { id: data.userId },
        select: { email: true, name: true },
      });
      const portalUrl = `${process.env.NEXTAUTH_URL ?? ""}/my-portal?contract=${contract.id}`;
      // TODO(phase 10): replace with contractIssuedEmail() from email-templates/contracts.ts
      const subject = `Your new contract from Amana OSHC — please review`;
      const emailHtml = `<p>Hi ${staff.name ?? "there"},</p><p>We've issued your <strong>${template.name}</strong>. Please review and acknowledge it in your portal: <a href="${portalUrl}">${portalUrl}</a></p><p>Or download the PDF directly: <a href="${url}">${url}</a></p>`;
      await sendEmail({ to: staff.email, subject, html: emailHtml });
    } catch (err) {
      emailFailed = true;
      logger.error("issue-from-template: email send failed", { contractId: contract.id, err });
    }

    return NextResponse.json({ ...contract, emailFailed }, { status: 201 });
  },
  {
    roles: ["owner", "admin"],
    feature: "contracts.create",
    rateLimit: { max: 10, windowMs: 60_000 },
  },
);

export const maxDuration = 30;
