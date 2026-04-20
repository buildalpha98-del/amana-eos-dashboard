import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  renderBlocksToHtml,
  interpolateVariables,
  marketingLayout,
  type EmailBlock,
} from "@/lib/email-marketing-layout";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
const bodySchema = z.object({
  templateId: z.string().optional().nullable(),
  htmlContent: z.string().optional().nullable(),
  blocks: z.array(z.any()).optional().nullable(),
  variables: z.record(z.string(), z.string()).optional(),
});

const SAMPLE_VARIABLES: Record<string, string> = {
  parentName: "Jane Smith",
  parentFirstName: "Jane",
  serviceName: "Amana OSHC Auburn",
  serviceCode: "AUB",
  enquiryDate: "17 March 2026",
  centreName: "Amana OSHC Auburn",
  centreAddress: "123 Example St, Auburn NSW 2144",
  centrePhone: "(02) 1234 5678",
};

export const POST = withApiAuth(async (req, session) => {
// Use session to avoid unused-var lint error
  void session;

  let raw: unknown;
  try {
    raw = await parseJsonBody(req);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const vars: Record<string, string> = {
    ...SAMPLE_VARIABLES,
    ...(body.variables ?? {}),
  };

  // ── Resolve HTML ──────────────────────────────────────────────
  let html: string;

  if (body.templateId) {
    const template = await prisma.emailTemplate.findUnique({
      where: { id: body.templateId },
    });
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }
    if (template.blocks) {
      html = renderBlocksToHtml(template.blocks as unknown as EmailBlock[], vars);
    } else if (template.htmlContent) {
      html = interpolateVariables(marketingLayout(template.htmlContent), vars);
    } else {
      html = marketingLayout(
        '<p style="color:#9ca3af;">This template has no content.</p>',
      );
    }
  } else if (body.blocks && body.blocks.length > 0) {
    html = renderBlocksToHtml(body.blocks as unknown as EmailBlock[], vars);
  } else if (body.htmlContent) {
    html = interpolateVariables(marketingLayout(body.htmlContent), vars);
  } else {
    html = marketingLayout(
      '<p style="color:#9ca3af;">No content to preview.</p>',
    );
  }

  return NextResponse.json({ html });
});
