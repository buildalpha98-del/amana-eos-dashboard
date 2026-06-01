import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { renderTemplateHtml, type TipTapDoc } from "@/lib/contract-templates/render-html";

/**
 * GET /api/contracts/[id]/render
 *
 * Re-renders a template-issued contract's HTML on demand, using the template's
 * stored TipTap doc + the resolved tag values that were captured at issuance
 * time. Used by the staff portal's inline contract viewer so we can show the
 * full document inside a modal instead of opening the baked PDF in a new tab.
 *
 * Access matrix (same as /document):
 *   - Contract.userId === viewer: allowed
 *   - Admin role (owner / admin / head_office): allowed
 *   - Anyone else: 403
 *
 * Returns 404 when:
 *   - The contract doesn't exist
 *   - The contract has no templateId (blank-form contract — the caller should
 *     fall back to the PDF view via /api/contracts/[id]/document)
 *   - The template was deleted (template relation is null even though
 *     templateId is set — SetNull on delete)
 *
 * Returns text/html (not JSON) — the client embeds the response body into an
 * iframe srcDoc.
 */
export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;

  const contract = await prisma.employmentContract.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      templateId: true,
      templateValues: true,
      template: { select: { contentJson: true } },
      // 2026-06-02: signature data URLs need to flow into the render
      // so admins/staff viewing the contract in the in-app modal see
      // both signatures, not just whatever was baked into the PDF.
      adminSignatureDataUrl: true,
      adminSignedAt: true,
      staffSignatureDataUrl: true,
      acknowledgedAt: true,
    },
  });
  if (!contract) throw ApiError.notFound("Contract not found");
  if (!contract.templateId || !contract.template) {
    // Blank-form contracts have no template to re-render from. The client
    // falls back to /api/contracts/[id]/document (the baked PDF).
    throw ApiError.notFound("Contract has no template");
  }

  const viewerId = session!.user.id;
  const viewerRole = session!.user.role ?? "";
  const isOwn = contract.userId === viewerId;
  const isAdmin = isAdminRole(viewerRole);
  if (!isOwn && !isAdmin) throw ApiError.forbidden();

  // templateValues is stored as `{ auto: Record<string,string>, manual: Record<string,string> }`
  // (see issue-from-template route). Merge in the same order: auto first,
  // manual overrides — matches how the PDF was originally rendered.
  const tv = (contract.templateValues ?? {}) as {
    auto?: Record<string, string>;
    manual?: Record<string, string>;
  };

  // Format the signature dates for the footer caption. en-AU long form
  // matches the rest of the document's date style.
  function friendlyDate(d: Date | null): string {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  const data: Record<string, string> = {
    ...(tv.auto ?? {}),
    ...(tv.manual ?? {}),
    "signature.admin": contract.adminSignatureDataUrl ?? "",
    "signature.staff": contract.staffSignatureDataUrl ?? "",
    // Auxiliary date keys consumed by the signature footer; templates
    // that place signatures inline can also reference these if they
    // want a date under the line.
    "signature.adminDate": friendlyDate(contract.adminSignedAt),
    "signature.staffDate": friendlyDate(contract.acknowledgedAt),
  };

  const { html } = renderTemplateHtml({
    doc: contract.template.contentJson as TipTapDoc,
    data,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Private so a shared iframe URL can't be CDN-cached across users.
      "Cache-Control": "private, no-store",
    },
  });
});
