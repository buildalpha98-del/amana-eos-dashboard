/**
 * Contracts email templates.
 *
 * 2026-05-17: contractIssuedEmail is admin-overridable via
 * EmailTemplateOverride (key "contracts.issued"). Defaults below.
 */

import { baseLayout, buttonHtml } from "./base";
import { applyEmailTemplateOverride } from "@/lib/email-template-overrides";

const CONTRACT_ISSUED_DEFAULT_SUBJECT =
  "Your new contract from Amana OSHC — please review";

const CONTRACT_ISSUED_DEFAULT_BODY = `
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Your new contract is ready
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi {{name}}, we've issued your <strong>{{contractName}}</strong>. Please review and acknowledge it in your portal.
    </p>
    {{reviewButton}}
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">
      Or download the PDF directly: <a href="{{pdfUrl}}" style="color:#3b82f6;">{{pdfUrl}}</a>
    </p>
  `;

export async function contractIssuedEmail(args: {
  name: string;
  contractName: string;
  portalUrl: string;
  pdfUrl: string;
}): Promise<{ subject: string; html: string }> {
  return applyEmailTemplateOverride({
    key: "contracts.issued",
    defaultSubject: CONTRACT_ISSUED_DEFAULT_SUBJECT,
    defaultBody: CONTRACT_ISSUED_DEFAULT_BODY,
    vars: {
      name: escape(args.name),
      contractName: escape(args.contractName),
      portalUrl: escape(args.portalUrl),
      pdfUrl: escape(args.pdfUrl),
      reviewButton: buttonHtml("Review & acknowledge", args.portalUrl),
    },
    wrap: baseLayout,
  });
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
