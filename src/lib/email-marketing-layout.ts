/**
 * Parent-facing email layout + block-to-HTML rendering + placeholder interpolation.
 *
 * Unlike baseLayout() in email-templates.ts (internal/system branding),
 * this wrapper is for parent-facing marketing emails: clean branding,
 * no "EOS Dashboard" subtitle, no "automated email" footer.
 */

// ── Types ─────────────────────────────────────────────────────

export interface EmailBlock {
  type: "heading" | "text" | "image" | "button" | "divider" | "spacer";
  // heading
  text?: string;
  level?: "h1" | "h2" | "h3";
  // text
  content?: string;
  // image
  url?: string;
  alt?: string;
  linkUrl?: string;
  // button
  label?: string;
  color?: string;
  // spacer
  height?: number;
}

// ── Layout Options ────────────────────────────────────────────

export interface EmailLayoutOptions {
  headerColor?: string;       // hex, default #004E64
  headerText?: string;        // default "Amana OSHC"
  headerLogoUrl?: string;     // optional logo image URL
  footerText?: string;        // default "Amana OSHC"
  footerUrl?: string;         // default "https://amanaoshc.com.au"
  footerUrlLabel?: string;    // default "amanaoshc.com.au"
  showUnsubscribe?: boolean;  // default true
}

const DEFAULT_LAYOUT: Required<EmailLayoutOptions> = {
  headerColor: "#004E64",
  headerText: "Amana OSHC",
  headerLogoUrl: "",
  footerText: "Amana OSHC",
  footerUrl: "https://amanaoshc.com.au",
  footerUrlLabel: "amanaoshc.com.au",
  showUnsubscribe: true,
};

// ── Layout ────────────────────────────────────────────────────

export function marketingLayout(content: string, opts?: EmailLayoutOptions): string {
  const o = { ...DEFAULT_LAYOUT, ...opts };
  const headerContent = o.headerLogoUrl
    ? `<img src="${o.headerLogoUrl}" alt="${o.headerText}" style="max-height:48px;display:block;margin:0 auto;" />`
    : `<h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${o.headerText}</h1>`;

  const unsubLink = o.showUnsubscribe
    ? `<br/><a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:${o.headerColor};padding:24px 32px;text-align:center;">
              ${headerContent}
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                ${o.footerText} &bull; <a href="${o.footerUrl}" style="color:#9ca3af;">${o.footerUrlLabel}</a>${unsubLink}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Block Rendering ───────────────────────────────────────────

const HEADING_STYLES: Record<string, string> = {
  h1: "margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;line-height:1.3;",
  h2: "margin:0 0 12px;font-size:20px;font-weight:600;color:#111827;line-height:1.3;",
  h3: "margin:0 0 8px;font-size:16px;font-weight:600;color:#374151;line-height:1.3;",
};

function renderBlock(block: EmailBlock): string {
  switch (block.type) {
    case "heading":
      return `<${block.level || "h2"} style="${HEADING_STYLES[block.level || "h2"]}">${escapeHtml(block.text || "")}</${block.level || "h2"}>`;

    case "text":
      return `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">${escapeHtml(block.content || "").replace(/\n/g, "<br/>")}</p>`;

    case "image": {
      const img = `<img src="${escapeHtml(block.url || "")}" alt="${escapeHtml(block.alt || "")}" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:0 auto 16px;" />`;
      return block.linkUrl
        ? `<a href="${escapeHtml(block.linkUrl)}" target="_blank">${img}</a>`
        : img;
    }

    case "button":
      return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
  <tr>
    <td align="center">
      <a href="${escapeHtml(block.url || block.linkUrl || "#")}" target="_blank" style="display:inline-block;background-color:${block.color || "#004E64"};color:#ffffff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">
        ${escapeHtml(block.label || "Click Here")}
      </a>
    </td>
  </tr>
</table>`;

    case "divider":
      return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />`;

    case "spacer":
      return `<div style="height:${block.height || 24}px;"></div>`;

    default:
      return "";
  }
}

export function renderBlocksToHtml(
  blocks: EmailBlock[],
  variables?: Record<string, string>,
  layoutOptions?: EmailLayoutOptions,
): string {
  const blockHtml = blocks.map(renderBlock).join("\n");
  const interpolated = variables
    ? interpolateVariables(blockHtml, variables)
    : blockHtml;
  return marketingLayout(interpolated, layoutOptions);
}

// ── Interpolation ─────────────────────────────────────────────

export function interpolateVariables(
  html: string,
  variables: Record<string, string>,
): string {
  return html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] ?? "";
  });
}

// ── Helpers ───────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
