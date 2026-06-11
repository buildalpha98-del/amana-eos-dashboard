import { describe, it, expect } from "vitest";
import {
  appendUnsubscribeFooter,
  escapeHtml,
} from "@/lib/email-templates/base";

describe("escapeHtml", () => {
  it("escapes HTML-significant characters", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });

  it("escapes ampersands and single quotes", () => {
    expect(escapeHtml(`Tom & Jerry's`)).toBe("Tom &amp; Jerry&#39;s");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Amana Bankstown")).toBe("Amana Bankstown");
  });
});

describe("appendUnsubscribeFooter", () => {
  const html = `<!DOCTYPE html><html><body><table>content</table></body></html>`;

  it("inserts the unsubscribe + manage-preferences links before </body>", () => {
    const out = appendUnsubscribeFooter(html, "contact-123", "https://amanaoshc.company");
    expect(out).toContain("Unsubscribe");
    expect(out).toContain("Manage email preferences");
    // footer must sit *inside* the document body
    expect(out.indexOf("Unsubscribe")).toBeLessThan(out.indexOf("</body>"));
  });

  it("links to the contact-specific preferences page", () => {
    const out = appendUnsubscribeFooter(html, "contact-123", "https://amanaoshc.company");
    expect(out).toContain("/notifications/preferences/contact-123");
  });

  it("appends to the end when there is no </body>", () => {
    const out = appendUnsubscribeFooter("<p>bare</p>", "contact-9", "https://x.test");
    expect(out.startsWith("<p>bare</p>")).toBe(true);
    expect(out).toContain("Unsubscribe");
  });
});
