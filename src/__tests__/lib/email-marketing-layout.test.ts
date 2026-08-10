import { describe, it, expect } from "vitest";
import {
  marketingLayout,
  renderBlocksToHtml,
  type EmailBlock,
} from "@/lib/email-marketing-layout";

// ── marketingLayout escaping ────────────────────────────────────
// Layout options originate from OrgSettings today and (Phase 7) from
// request bodies — every `o.*` interpolation must be HTML-escaped just
// like renderBlock already escapes block fields. The canonical breakout
// pin is `"><script>`: unescaped, it closes the surrounding attribute /
// tag and injects a script element.

describe("marketingLayout — escaping of layout options", () => {
  const BREAKOUT = '"><script>alert(1)</script>';

  it("escapes a quote/tag breakout in headerText (h1 branch)", () => {
    const html = marketingLayout("<p>body</p>", { headerText: BREAKOUT });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("escapes headerText when used as the logo alt attribute", () => {
    const html = marketingLayout("<p>body</p>", {
      headerLogoUrl: "https://example.com/logo.png",
      headerText: BREAKOUT,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('alt="">');
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("escapes an attribute breakout in headerLogoUrl", () => {
    const html = marketingLayout("<p>body</p>", {
      headerLogoUrl: 'https://example.com/x.png" onerror="alert(1)',
    });
    expect(html).not.toContain('" onerror="');
    expect(html).toContain("&quot; onerror=&quot;");
  });

  it("escapes a style-attribute breakout in headerColor", () => {
    const html = marketingLayout("<p>body</p>", {
      headerColor: '#fff" onmouseover="alert(1)',
    });
    expect(html).not.toContain('" onmouseover="');
  });

  it("escapes a quote/tag breakout in footerText", () => {
    const html = marketingLayout("<p>body</p>", { footerText: BREAKOUT });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("escapes an attribute breakout in footerUrl", () => {
    const html = marketingLayout("<p>body</p>", {
      footerUrl: 'https://example.com" onclick="alert(1)',
    });
    expect(html).not.toContain('" onclick="');
    expect(html).toContain("&quot; onclick=&quot;");
  });

  it("escapes a quote/tag breakout in footerUrlLabel", () => {
    const html = marketingLayout("<p>body</p>", { footerUrlLabel: BREAKOUT });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("regression: default layout still renders header, footer and unsubscribe", () => {
    const html = marketingLayout("<p>body copy</p>");
    expect(html).toContain("Amana OSHC");
    expect(html).toContain("#004E64");
    expect(html).toContain('href="https://amanaoshc.com.au"');
    expect(html).toContain("amanaoshc.com.au</a>");
    expect(html).toContain("{{unsubscribeUrl}}");
    expect(html).toContain("<p>body copy</p>");
  });

  it("regression: custom (benign) options render verbatim", () => {
    const html = marketingLayout("<p>body</p>", {
      headerText: "Bright Futures OSHC",
      headerColor: "#112233",
      footerText: "Bright Futures OSHC",
      footerUrl: "https://bright.example.com",
      footerUrlLabel: "bright.example.com",
      showUnsubscribe: false,
    });
    expect(html).toContain("Bright Futures OSHC");
    expect(html).toContain("#112233");
    expect(html).toContain('href="https://bright.example.com"');
    expect(html).not.toContain("Unsubscribe");
  });

  it("does NOT escape the content argument (it is pre-rendered HTML)", () => {
    const html = marketingLayout('<a href="https://x.test">link</a>');
    expect(html).toContain('<a href="https://x.test">link</a>');
  });
});

// ── renderBlocksToHtml passthrough ──────────────────────────────

describe("renderBlocksToHtml — layoutOptions passthrough", () => {
  const blocks: EmailBlock[] = [{ type: "text", content: "Hello {{firstName}}" }];

  it("forwards layoutOptions to the wrapping marketingLayout", () => {
    const html = renderBlocksToHtml(blocks, undefined, {
      headerText: "Bright Futures OSHC",
    });
    expect(html).toContain("Bright Futures OSHC");
  });

  it("escapes hostile layoutOptions on the blocks path too", () => {
    const html = renderBlocksToHtml(blocks, undefined, {
      headerText: '"><script>alert(1)</script>',
    });
    expect(html).not.toContain("<script>");
  });
});
