import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { renderTemplateHtml, type TipTapDoc } from "@/lib/contract-templates/render-html";
import { resolveTemplateData, type ContractMetaInput } from "@/lib/contract-templates/resolve-data";
import { SAMPLE_RESOLVED_AUTO } from "@/lib/contract-templates/sample-data";

const contractMetaSchema = z.object({
  contractType: z.enum(["ct_casual", "ct_part_time", "ct_permanent", "ct_fixed_term"]),
  awardLevel: z.string().nullish(),
  awardLevelCustom: z.string().nullish(),
  payRate: z.number().positive(),
  hoursPerWeek: z.number().positive().nullish(),
  startDate: z.string().min(1),
  endDate: z.string().nullish(),
  position: z.string().min(1),
});

const previewBodySchema = z.object({
  userId: z.string().optional(),
  manualValues: z.record(z.string(), z.string()).optional(),
  contractMeta: contractMetaSchema.optional(),
});

export const POST = withApiAuth(
  async (req, _session, context) => {
    const { id } = await (context?.params as Promise<{ id: string }>);

    const template = await prisma.contractTemplate.findUnique({
      where: { id },
    });
    if (!template) throw ApiError.notFound("Template not found");

    const rawBody = await parseJsonBody(req);
    const parsed = previewBodySchema.safeParse(rawBody);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    const body = parsed.data;

    let resolved: Record<string, string>;

    if (body.userId && body.contractMeta) {
      const meta: ContractMetaInput = {
        contractType: body.contractMeta.contractType,
        awardLevel: (body.contractMeta.awardLevel as ContractMetaInput["awardLevel"]) ?? null,
        awardLevelCustom: body.contractMeta.awardLevelCustom ?? null,
        payRate: body.contractMeta.payRate,
        hoursPerWeek: body.contractMeta.hoursPerWeek ?? null,
        startDate: new Date(body.contractMeta.startDate),
        endDate: body.contractMeta.endDate ? new Date(body.contractMeta.endDate) : null,
        position: body.contractMeta.position,
      };
      const result = await resolveTemplateData({ userId: body.userId, contractMeta: meta });
      resolved = result.resolved;
    } else {
      resolved = { ...SAMPLE_RESOLVED_AUTO };
    }

    // Merge manual values on top of resolved data
    const data = { ...resolved, ...(body.manualValues ?? {}) };

    const { html, missingTags } = renderTemplateHtml({
      doc: template.contentJson as TipTapDoc,
      data,
    });

    return NextResponse.json({ html, missingTags });
  },
  { roles: ["owner", "admin"], feature: "contracts.view", rateLimit: { max: 20, windowMs: 60_000 } }
);
