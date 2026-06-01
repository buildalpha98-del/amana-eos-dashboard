export type TipTapMark = { type: string; attrs?: Record<string, unknown> };
export type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
};
export type TipTapDoc = { type: "doc"; content?: TipTapNode[] };

const CSS = `
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; margin: 2cm; color: #111; }
  h1 { font-size: 16pt; margin: 1em 0 0.5em; }
  h2 { font-size: 14pt; margin: 1em 0 0.5em; }
  h3 { font-size: 13pt; margin: 1em 0 0.5em; }
  p { margin: 0.5em 0; }
  ul, ol { margin: 0.5em 0; padding-left: 2em; }
  li { margin: 0.25em 0; }
  blockquote { border-left: 3px solid #ccc; margin: 1em 0; padding-left: 1em; color: #555; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #ccc; padding: 0.4em 0.8em; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; }
  .missing { background: #fee; color: #c00; border: 1px dashed #c00; padding: 0 3px; border-radius: 2px; }
  .page-break { page-break-before: always; }
  @media print { .page-break { page-break-before: always; } }
`;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHref(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:")) {
    return raw;
  }
  return "#";
}

function renderNodes(nodes: TipTapNode[] | undefined, data: Record<string, string>, missing: string[]): string {
  if (!nodes) return "";
  return nodes.map((node) => renderNode(node, data, missing)).join("");
}

function renderNode(node: TipTapNode, data: Record<string, string>, missing: string[]): string {
  switch (node.type) {
    case "paragraph":
      return `<p>${renderNodes(node.content, data, missing)}</p>`;

    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      const l = Math.min(Math.max(level, 1), 3);
      return `<h${l}>${renderNodes(node.content, data, missing)}</h${l}>`;
    }

    case "bulletList":
      return `<ul>${renderNodes(node.content, data, missing)}</ul>`;

    case "orderedList":
      return `<ol>${renderNodes(node.content, data, missing)}</ol>`;

    case "listItem":
      return `<li>${renderNodes(node.content, data, missing)}</li>`;

    case "blockquote":
      return `<blockquote>${renderNodes(node.content, data, missing)}</blockquote>`;

    case "table":
      return `<table><tbody>${renderNodes(node.content, data, missing)}</tbody></table>`;

    case "tableRow":
      return `<tr>${renderNodes(node.content, data, missing)}</tr>`;

    case "tableCell":
      return `<td>${renderNodes(node.content, data, missing)}</td>`;

    case "tableHeader":
      return `<th>${renderNodes(node.content, data, missing)}</th>`;

    case "text": {
      let inner = escapeHtml(node.text ?? "");
      if (node.marks && node.marks.length > 0) {
        // Apply marks inside-out (innermost first, wrapped outward)
        for (const mark of [...node.marks].reverse()) {
          switch (mark.type) {
            case "bold":
              inner = `<strong>${inner}</strong>`;
              break;
            case "italic":
              inner = `<em>${inner}</em>`;
              break;
            case "underline":
              inner = `<u>${inner}</u>`;
              break;
            case "strike":
              inner = `<s>${inner}</s>`;
              break;
            case "link": {
              const href = escapeHtml(sanitizeHref(String(mark.attrs?.href ?? "")));
              inner = `<a href="${href}">${inner}</a>`;
              break;
            }
          }
        }
      }
      return inner;
    }

    case "mergeTag": {
      const key = String(node.attrs?.key ?? "");

      // Signature placeholders are special: the data value is a PNG
      // data URL, not a string we want to escape. Render an <img>
      // sized for a contract signature line, or a discreet blank
      // strip when no signature has been captured yet (admin issued
      // but staff hasn't signed — first-render path).
      if (key === "signature.admin" || key === "signature.staff") {
        const value = data[key] ?? "";
        if (value && value.startsWith("data:image/")) {
          // Width capped so the canvas image doesn't blow out the
          // signature line; height limit keeps tall scribbles in
          // bounds. inline-block + vertical-align baseline so it
          // sits where the cursor would on a printed page.
          return `<img src="${value}" alt="Signature" style="display:inline-block;max-width:240px;max-height:80px;vertical-align:baseline;" />`;
        }
        // No signature yet — leave a small empty rule so the layout
        // doesn't collapse. Authors typically place this under "Signed:
        // ___________" so a missing signature reads naturally as "not
        // yet signed."
        return `<span style="display:inline-block;min-width:200px;border-bottom:1px solid #aaa;height:1.4em;vertical-align:baseline;"></span>`;
      }

      if (key in data) {
        return escapeHtml(data[key]);
      }
      missing.push(key);
      return `<span class="missing">{{${escapeHtml(key)}}}</span>`;
    }

    case "pageBreak":
      return `<div style="page-break-before: always"></div>`;

    case "hardBreak":
      return `<br />`;

    default:
      // Defensive: unknown node — render children if any
      return renderNodes(node.content, data, missing);
  }
}

export function renderTemplateHtml(args: {
  doc: TipTapDoc;
  data: Record<string, string>;
}): { html: string; missingTags: string[] } {
  const { doc, data } = args;
  const missingTags: string[] = [];

  const body = renderNodes(doc.content, data, missingTags);

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;

  return { html, missingTags };
}
