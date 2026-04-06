import { sendEmail, FROM_EMAIL } from "@/lib/email";
import { logger } from "@/lib/logger";

const BRAND_COLOR = "#004E64";

export async function sendUnsignedInAlert(
  serviceId: string,
  serviceName: string,
  coordinatorEmail: string,
  coordinatorName: string,
  date: Date,
  children: Array<{ firstName: string; surname: string }>,
): Promise<void> {
  if (children.length === 0) return;

  const dateStr = date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const childList = children
    .map((c) => `<li style="padding:4px 0;color:#374151;">${c.firstName} ${c.surname}</li>`)
    .join("");

  try {
    await sendEmail({
      from: FROM_EMAIL,
      to: coordinatorEmail,
      subject: `⚠️ Unsigned-in children — ${serviceName} BSC ${date.toLocaleDateString("en-AU")}`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f8f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f8f5f2;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <tr><td style="background:${BRAND_COLOR};padding:20px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700;">Amana OSHC</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Attendance Alert</p>
      </td></tr>
      <tr><td style="padding:28px 32px;">
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
          Hi ${coordinatorName},
        </p>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
          The following <strong>${children.length}</strong> child${children.length !== 1 ? "ren" : ""} at <strong>${serviceName}</strong>
          have not been signed in for the BSC session on ${dateStr}:
        </p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin:0 0 16px;">
          <ul style="margin:0;padding:0 0 0 16px;font-size:14px;">${childList}</ul>
        </div>
        <p style="margin:0;color:#6b7280;font-size:13px;">
          Please check these children have arrived safely or contact their parents.
        </p>
      </td></tr>
      <tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">Automated alert from Amana OSHC Dashboard</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
    });
  } catch (err) {
    logger.error("Failed to send unsigned-in alert", { serviceId, err });
  }
}
