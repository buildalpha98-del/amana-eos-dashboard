import { describe, it, expect } from "vitest";
import { contractIssuedEmail } from "@/lib/email-templates/contracts";

describe("contractIssuedEmail", () => {
  const BASE_ARGS = {
    name: "Jane Smith",
    contractName: "Part-Time Educator Contract",
    portalUrl: "https://amanaoshc.company/my-portal?contract=abc123",
    pdfUrl: "https://blob.storage/contracts/contract-abc123.pdf",
  };

  it("returns the expected subject", () => {
    const { subject } = contractIssuedEmail(BASE_ARGS);
    expect(subject).toBe("Your new contract from Amana OSHC — please review");
  });

  it("html contains the contract name", () => {
    const { html } = contractIssuedEmail(BASE_ARGS);
    expect(html).toContain("Part-Time Educator Contract");
  });

  it("html contains the portal URL", () => {
    const { html } = contractIssuedEmail(BASE_ARGS);
    expect(html).toContain(BASE_ARGS.portalUrl);
  });

  it("html contains button text 'Review &amp; acknowledge' or 'Review & acknowledge'", () => {
    const { html } = contractIssuedEmail(BASE_ARGS);
    // buttonHtml uses the text directly; the href is encoded but the button text may not be
    expect(html).toMatch(/Review.*acknowledge/i);
  });

  it("html contains the PDF URL", () => {
    const { html } = contractIssuedEmail(BASE_ARGS);
    expect(html).toContain(BASE_ARGS.pdfUrl);
  });

  it("escapes HTML in name: <script> becomes &lt;script&gt;", () => {
    const { html } = contractIssuedEmail({ ...BASE_ARGS, name: "<script>" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in contractName: <b>Evil</b> becomes &lt;b&gt;Evil&lt;/b&gt;", () => {
    const { html } = contractIssuedEmail({ ...BASE_ARGS, contractName: "<b>Evil</b>" });
    expect(html).not.toContain("<b>Evil</b>");
    expect(html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
  });

  it("escapes ampersand in contractName: A&B becomes A&amp;B", () => {
    const { html } = contractIssuedEmail({ ...BASE_ARGS, contractName: "A&B Contract" });
    expect(html).toContain("A&amp;B Contract");
  });
});
