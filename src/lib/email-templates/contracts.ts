import { baseLayout, buttonHtml } from "./base";

export function contractIssuedEmail(args: {
  name: string;
  contractName: string;
  portalUrl: string;
  pdfUrl: string;
}): { subject: string; html: string } {
  const subject = `Your new contract from Amana OSHC — please review`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Your new contract is ready
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${escape(args.name)}, we've issued your <strong>${escape(args.contractName)}</strong>. Please review and acknowledge it in your portal.
    </p>
    ${buttonHtml("Review & acknowledge", args.portalUrl)}
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">
      Or download the PDF directly: <a href="${escape(args.pdfUrl)}" style="color:#3b82f6;">${escape(args.pdfUrl)}</a>
    </p>
  `);
  return { subject, html };
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
