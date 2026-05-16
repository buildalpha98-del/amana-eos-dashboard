/**
 * GET /api/email-template-overrides — list every known transactional email
 * template (from the manifest) with its current override (or null). Used by
 * the /settings/email-templates list page.
 *
 * 2026-05-17.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { EMAIL_TEMPLATE_MANIFEST } from "@/lib/email-template-manifest";
import { listEmailTemplateOverrides } from "@/lib/email-template-overrides";

export const GET = withApiAuth(
  async () => {
    const rows = await listEmailTemplateOverrides(EMAIL_TEMPLATE_MANIFEST);
    return NextResponse.json({ templates: rows });
  },
  { roles: ["owner", "admin"] },
);
