import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { uploadFile } from "@/lib/storage";
import { resolveTemplateData } from "@/lib/contract-templates/resolve-data";
import { extractMergeTagKeys } from "@/lib/contract-templates/extract-merge-tags";
import { renderTemplateHtml, type TipTapDoc } from "@/lib/contract-templates/render-html";
import { renderContractPdf } from "@/lib/pdf/render-contract";
import { sendEmail } from "@/lib/email";
import { contractIssuedEmail } from "@/lib/email-templates/contracts";

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
  // 2026-06-02: admin signs the contract before issuing — captured
  // as a PNG data URL from the signature pad. Optional so the legacy
  // "issue without signing" path still works while we roll the
  // feature out; the UI will require it once the rollout is complete.
  adminSignatureDataUrl: z
    .string()
    .startsWith("data:image/", "Must be a PNG data URL")
    .max(500_000, "Signature image too large")
    .optional(),
  // 2026-07-13: opt-in supersede toggle from the Issue-Contract wizard.
  // When true AND the staff member has an active/draft contract, that
  // contract flips to superseded and the rendered PDF gets a boilerplate
  // "this supersedes any prior agreement" notice paragraph up top. When
  // false (or when there's no existing contract), the new contract is
  // issued alongside any others and no notice is added.
  supersedeExisting: z.boolean().optional().default(false),
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

    // Step 4: resolve auto tags — blocks on missing required staff
    // fields. 2026-07-23: only enforce blocking on tags the template
    // actually REFERENCES. resolveTemplateData is generic and reports
    // every catalog blocking tag it couldn't fill (e.g. service.name
    // when the staff member has no serviceId), but a template that
    // doesn't mention service.name shouldn't fail on it.
    const { resolved, missingBlocking } = await resolveTemplateData({
      userId: data.userId,
      contractMeta: {
        ...data.contractMeta,
        startDate,
        endDate,
        position: data.contractMeta.position,
      },
    });
    const referencedTagKeys = new Set(
      extractMergeTagKeys(template.contentJson as TipTapDoc),
    );
    const relevantMissing = missingBlocking.filter((k) =>
      referencedTagKeys.has(k),
    );
    if (relevantMissing.length) {
      throw ApiError.badRequest(
        `Missing required staff fields: ${relevantMissing.join(", ")}`,
      );
    }

    // Step 5: render HTML — merge auto + manual; unknown tags fail here.
    // Signature merge tags get the data URL straight from the request
    // (admin) or empty string (staff — they sign later, triggering a
    // re-render). Date captions are populated for the signature footer
    // — admin date is "now" at issue time; staff is empty until they sign.
    const adminDateFriendly = new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const allData = {
      ...resolved,
      ...data.manualValues,
      "signature.admin": data.adminSignatureDataUrl ?? "",
      "signature.staff": "",
      "signature.adminDate": data.adminSignatureDataUrl ? adminDateFriendly : "",
      "signature.staffDate": "",
    };
    // 2026-07-13: opt-in supersede. Looked up BEFORE HTML render so the
    // rendered PDF can include the supersede notice. Only actually
    // touches the existing row when the wizard's "Replace previous
    // contract" checkbox is ticked. Rationale for opt-in: an admin
    // sometimes wants to issue an additional contract (e.g. a second
    // casual engagement running in parallel) without wiping the
    // previous. The wizard defaults the checkbox to true when it
    // detects an existing active contract, so Daniel's FT→Casual flow
    // stays one-click.
    const existingActive = data.supersedeExisting
      ? await prisma.employmentContract.findFirst({
          where: {
            userId: data.userId,
            status: { in: ["active", "contract_draft"] },
          },
          select: { id: true },
          orderBy: { startDate: "desc" },
        })
      : null;

    const { html: bodyHtml, missingTags } = renderTemplateHtml({
      doc: template.contentJson as TipTapDoc,
      data: allData,
    });
    if (missingTags.length) {
      throw ApiError.badRequest(`Template references unknown tags: ${missingTags.join(", ")}`);
    }

    // When superseding, prepend a plain-language notice to the rendered
    // HTML so the printed contract makes the transition explicit.
    const supersedeNoticeHtml = existingActive
      ? `<p style="padding:12px 14px;margin:0 0 16px 0;border:1px solid #d1d5db;background:#f9fafb;font-size:11pt;line-height:1.5;"><strong>Notice:</strong> This contract, effective from ${new Date(startDate).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}, supersedes and replaces any prior employment agreement between you and AMANA OSHC PTY LTD. The prior agreement ceases on the date this contract takes effect.</p>`
      : "";
    const html = supersedeNoticeHtml + bodyHtml;

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
      if (existingActive) {
        await tx.employmentContract.update({
          where: { id: existingActive.id },
          data: {
            status: "superseded",
            endDate: startDate,
          },
        });
      }

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
          previousContractId: existingActive?.id ?? null,
          // Persist admin signature alongside the contract so re-renders
          // (after staff signs) can replay it without the admin needing
          // to re-draw. signedById/At are an audit trail of WHO signed
          // and WHEN — useful for Fair Work disputes about whether the
          // contract was properly issued.
          adminSignatureDataUrl: data.adminSignatureDataUrl ?? null,
          adminSignedById: data.adminSignatureDataUrl ? session!.user.id : null,
          adminSignedAt: data.adminSignatureDataUrl ? new Date() : null,
        },
      });
      await tx.activityLog.create({
        data: {
          userId: session!.user.id,
          action: existingActive ? "issue_from_template_supersede" : "issue_from_template",
          entityType: "EmploymentContract",
          entityId: created.id,
          details: {
            templateId: template.id,
            templateName: template.name,
            ...(existingActive ? { supersededId: existingActive.id } : {}),
          },
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
      const { subject, html: emailHtml } = await contractIssuedEmail({
        name: staff.name ?? "there",
        contractName: template.name,
        portalUrl,
        pdfUrl: url,
      });
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
