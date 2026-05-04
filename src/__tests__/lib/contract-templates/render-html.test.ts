import { describe, it, expect } from "vitest";
import { renderTemplateHtml } from "@/lib/contract-templates/render-html";
import type { TipTapDoc } from "@/lib/contract-templates/render-html";

describe("renderTemplateHtml", () => {
  it("empty doc returns shell HTML with empty body, missingTags: []", () => {
    const doc: TipTapDoc = { type: "doc", content: [] };
    const { html, missingTags } = renderTemplateHtml({ doc, data: {} });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<body>");
    expect(html).toContain("</body>");
    expect(missingTags).toEqual([]);
  });

  it("mergeTag with key in data renders escaped value", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "mergeTag", attrs: { key: "staff.firstName" } }],
        },
      ],
    };
    const { html, missingTags } = renderTemplateHtml({ doc, data: { "staff.firstName": "Sarah" } });

    expect(html).toContain("Sarah");
    expect(missingTags).toEqual([]);
  });

  it("mergeTag with key NOT in data renders missing span and adds to missingTags", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "mergeTag", attrs: { key: "staff.firstName" } }],
        },
      ],
    };
    const { html, missingTags } = renderTemplateHtml({ doc, data: {} });

    expect(html).toContain('<span class="missing">{{staff.firstName}}</span>');
    expect(missingTags).toContain("staff.firstName");
  });

  it("HTML escape: script tag in data value is escaped", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "mergeTag", attrs: { key: "staff.firstName" } }],
        },
      ],
    };
    const { html } = renderTemplateHtml({
      doc,
      data: { "staff.firstName": "<script>alert(1)</script>" },
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("heading level 1 renders <h1>", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Title" }],
        },
      ],
    };
    const { html } = renderTemplateHtml({ doc, data: {} });

    expect(html).toContain("<h1>");
    expect(html).toContain("Title");
    expect(html).toContain("</h1>");
  });

  it("bold mark on text renders <strong>", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Bold text",
              marks: [{ type: "bold" }],
            },
          ],
        },
      ],
    };
    const { html } = renderTemplateHtml({ doc, data: {} });

    expect(html).toContain("<strong>Bold text</strong>");
  });

  it("bullet list with two items renders <ul><li>...</li><li>...</li></ul>", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item 1" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item 2" }] }] },
          ],
        },
      ],
    };
    const { html } = renderTemplateHtml({ doc, data: {} });

    expect(html).toContain("<ul>");
    expect(html).toContain("<li>");
    expect(html).toContain("Item 1");
    expect(html).toContain("Item 2");
    expect(html).toContain("</ul>");
  });

  it("pageBreak node renders page-break div", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [{ type: "pageBreak" }],
    };
    const { html } = renderTemplateHtml({ doc, data: {} });

    expect(html).toContain('style="page-break-before: always"');
  });

  it("table with one row and one cell renders table structure", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Cell" }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    const { html } = renderTemplateHtml({ doc, data: {} });

    expect(html).toContain("<table>");
    expect(html).toContain("<tr>");
    expect(html).toContain("<td>");
    expect(html).toContain("Cell");
  });

  it("blocks javascript: URIs in link href (XSS prevention)", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{
          type: "text",
          text: "click",
          marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
        }],
      }],
    };
    const { html } = renderTemplateHtml({ doc, data: {} });
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#"');
  });

  it("blocks data: URIs in link href", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{
          type: "text",
          text: "click",
          marks: [{ type: "link", attrs: { href: "data:text/html,<script>alert(1)</script>" } }],
        }],
      }],
    };
    const { html } = renderTemplateHtml({ doc, data: {} });
    expect(html).not.toContain("data:text/html");
    expect(html).toContain('href="#"');
  });

  it("preserves http(s) and mailto URIs in link href", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "a", marks: [{ type: "link", attrs: { href: "https://example.com/x?y=1" } }] },
          { type: "text", text: "b", marks: [{ type: "link", attrs: { href: "mailto:hi@example.com" } }] },
        ],
      }],
    };
    const { html } = renderTemplateHtml({ doc, data: {} });
    expect(html).toContain('href="https://example.com/x?y=1"');
    expect(html).toContain('href="mailto:hi@example.com"');
  });
});
