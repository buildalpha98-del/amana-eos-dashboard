import { describe, it, expect } from "vitest";
import { creativeRequestAssignedEmail } from "@/lib/email-templates/notifications";

// Creative-request intake (POST /api/creative-requests) is open to every
// authenticated role, so titles are user-typed. These tests pin the same
// escaping contract PR #210 established for todo/rock/issue assignment
// emails: user-controlled vars escaped, trusted CTA HTML left raw.
const XSS_TITLE = '<img src=x onerror=alert(1)>';
const XSS_ESCAPED = "&lt;img src=x onerror=alert(1)&gt;";
const DASHBOARD_URL = "https://dashboard.amanaoshc.com.au/requests?open=abc123";

describe("creativeRequestAssignedEmail escaping", () => {
  it("escapes an HTML-injection request title", async () => {
    const { html } = await creativeRequestAssignedEmail(
      "Mirna",
      XSS_TITLE,
      "REQ-2026-0042",
      "Daniel",
      DASHBOARD_URL,
    );
    expect(html).not.toContain(XSS_TITLE);
    expect(html).toContain(XSS_ESCAPED);
  });

  it("escapes assignee and assigner names and the request number", async () => {
    const { html } = await creativeRequestAssignedEmail(
      "<b>Evil</b>",
      "Term 3 holiday program poster",
      '<i>REQ-spoof</i>',
      '"><a href="https://phish.example">Daniel</a>',
      DASHBOARD_URL,
    );
    expect(html).not.toContain("<b>Evil</b>");
    expect(html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
    expect(html).not.toContain("<i>REQ-spoof</i>");
    expect(html).not.toContain('<a href="https://phish.example">');
  });

  it("keeps the trusted viewButton CTA as real HTML", async () => {
    const { html } = await creativeRequestAssignedEmail(
      "Mirna",
      XSS_TITLE,
      "REQ-2026-0042",
      "Daniel",
      DASHBOARD_URL,
    );
    expect(html).toContain(`<a href="${DASHBOARD_URL}"`);
    expect(html).toContain("View request");
  });

  it("renders plain values unchanged (ampersand aside)", async () => {
    const { html } = await creativeRequestAssignedEmail(
      "Mirna",
      "Art & craft flyer",
      "REQ-2026-0042",
      "Daniel",
      DASHBOARD_URL,
    );
    expect(html).toContain("Art &amp; craft flyer");
    expect(html).toContain("REQ-2026-0042");
  });
});
