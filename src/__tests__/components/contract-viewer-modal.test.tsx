// @vitest-environment jsdom
/**
 * Behaviour tests for ContractViewerModal — the inline contract viewer on
 * the staff portal.
 *
 * Coverage:
 *   - Renders inline (portaled into the document, NOT a target="_blank" link)
 *   - Template-based contracts: fetches /api/contracts/[id]/render and shows
 *     the response in an iframe srcDoc
 *   - Blank-form contracts: shows the documentUrl PDF in an iframe src
 *   - Acknowledge button reachable from inside the modal; clicking it POSTs
 *     to /api/contracts/[id]/acknowledge
 *   - After successful acknowledge, the footer flips to "Acknowledged just now"
 *   - Escape key closes the modal
 *   - Already-acknowledged contracts don't render an Acknowledge button
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ContractViewerModal, type ContractViewerContract } from "@/components/my-portal/ContractViewerModal";

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/components/contracts/SignaturePad", async () => {
  const React = await import("react");
  return {
    SignaturePad: ({
      onChange,
      disabled,
    }: {
      onChange: (data: string | null) => void;
      label?: string;
      disabled?: boolean;
    }) =>
      React.default.createElement(
        "button",
        {
          "data-testid": "mock-sign-here",
          onClick: () => onChange("data:image/png;base64,fakesig"),
          disabled,
          type: "button",
        },
        "Draw Signature",
      ),
  };
});

function wrap(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const baseTemplateContract: ContractViewerContract = {
  id: "ct-1",
  contractType: "ct_part_time",
  startDate: "2026-02-01",
  endDate: null,
  isTemplateBased: true,
  documentUrl: "https://blob.example.com/ct-1.pdf",
  acknowledged: false,
  acknowledgedAt: null,
  canAcknowledge: true,
};

const baseBlankFormContract: ContractViewerContract = {
  id: "ct-2",
  contractType: "ct_permanent",
  startDate: "2026-01-01",
  endDate: null,
  isTemplateBased: false,
  documentUrl: "https://blob.example.com/ct-2.pdf",
  acknowledged: false,
  acknowledgedAt: null,
  canAcknowledge: true,
};

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

describe("ContractViewerModal", () => {
  it("renders the contract inline (modal is in the document, NOT a target=_blank link)", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response("<html><body>Contract Body</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    render(wrap(<ContractViewerModal contract={baseTemplateContract} onClose={() => {}} />));

    // The modal renders a dialog into the document body — not a navigation link.
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /open in new tab/i })).not.toBeNull();
    // The primary "Read" entry point is the modal itself, no target=_blank link
    // on the page that bypasses inline rendering.
    expect(screen.queryByRole("link", { name: /^view contract$/i })).toBeNull();
  });

  it("for template-based contracts, fetches /render and pipes the HTML into the iframe srcDoc", async () => {
    const html = "<html><body>Hello Daniel.</body></html>";
    const fetchSpy = vi.fn().mockResolvedValueOnce(
      new Response(html, { status: 200, headers: { "Content-Type": "text/html" } }),
    );
    global.fetch = fetchSpy;

    render(wrap(<ContractViewerModal contract={baseTemplateContract} onClose={() => {}} />));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/contracts/ct-1/render");
    });

    await waitFor(() => {
      const iframe = screen.getByTestId("contract-viewer-iframe") as HTMLIFrameElement;
      // The modal injects a viewer-only <style> block (max-width 78ch, mobile
      // responsive) into the srcDoc before passing it to the iframe. Assert
      // that BOTH the original body content AND the injection are present —
      // covers the regression where the destructure-style "expect equals
      // raw HTML" assertion broke when the wrapper started post-processing.
      const srcdoc = iframe.getAttribute("srcdoc") ?? "";
      expect(srcdoc).toContain("Hello Daniel.");
      expect(srcdoc).toMatch(/max-width:\s*78ch/);
    });
  });

  it("for blank-form contracts, embeds the documentUrl PDF directly (no /render fetch)", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    render(wrap(<ContractViewerModal contract={baseBlankFormContract} onClose={() => {}} />));

    const iframe = await screen.findByTestId("contract-viewer-iframe");
    expect(iframe.getAttribute("src")).toBe("https://blob.example.com/ct-2.pdf");
    expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining("/render"));
  });

  it("clicking Acknowledge POSTs to /api/contracts/[id]/acknowledge and flips the footer", async () => {
    const fetchSpy = vi
      .fn()
      // First call: GET /render
      .mockResolvedValueOnce(
        new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } }),
      )
      // Second call: POST /acknowledge
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "ct-1", acknowledgedByStaff: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    global.fetch = fetchSpy;

    render(wrap(<ContractViewerModal contract={baseTemplateContract} onClose={() => {}} />));

    // Click the Sign Contract button to open signing mode.
    const btn = await screen.findByTestId("contract-viewer-acknowledge");
    fireEvent.click(btn);

    // Mock SignaturePad renders a "Draw Signature" button; clicking it sets the sig data URL.
    const drawBtn = await screen.findByTestId("mock-sign-here");
    fireEvent.click(drawBtn);

    // Now click "Confirm signature" (enabled once a sig data URL is set).
    const confirmBtn = await screen.findByText("Confirm signature");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/contracts/ct-1/acknowledge",
        expect.objectContaining({ method: "POST" }),
      );
    });

    // Footer transitions to "Signed just now" and the button is gone.
    await waitFor(() => {
      expect(screen.getByText(/signed just now/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("contract-viewer-acknowledge")).toBeNull();
  });

  it("does NOT render the Acknowledge button when canAcknowledge is false (historical / already acked)", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    );

    const alreadyAcked: ContractViewerContract = {
      ...baseTemplateContract,
      acknowledged: true,
      acknowledgedAt: "2026-02-15T10:00:00Z",
      canAcknowledge: false,
    };
    render(wrap(<ContractViewerModal contract={alreadyAcked} onClose={() => {}} />));

    // Wait for content load to settle.
    await screen.findByTestId("contract-viewer-iframe");
    expect(screen.queryByTestId("contract-viewer-acknowledge")).toBeNull();
    expect(screen.getByText(/signed on/i)).toBeInTheDocument();
  });

  it("pressing Escape calls onClose", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    );

    const onClose = vi.fn();
    render(wrap(<ContractViewerModal contract={baseTemplateContract} onClose={onClose} />));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses full-screen layout on mobile and 90vw × 90vh on desktop (capped at 1400px)", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    );

    render(wrap(<ContractViewerModal contract={baseTemplateContract} onClose={() => {}} />));

    const dialog = await screen.findByRole("dialog");
    // Mobile: `w-full h-full` so it covers the whole screen edge-to-edge.
    expect(dialog.className).toMatch(/\bw-full\b/);
    expect(dialog.className).toMatch(/\bh-full\b/);
    // Desktop: explicit 90vw × 90vh sizing so a long handbook actually fills
    // the screen — the previous max-w-4xl (768px) was unusable on a 1440px
    // monitor. NB: no trailing `\b` after `]` — `]` is a non-word character
    // and the next char is whitespace, so the regex `\bsm:w-\[90vw\]\b` was
    // unmatchable (which silently passed before the test runner caught it).
    expect(dialog.className).toContain("sm:w-[90vw]");
    expect(dialog.className).toContain("sm:h-[90vh]");
    expect(dialog.className).toContain("sm:max-w-[1400px]");
    expect(dialog.className).toMatch(/\bsm:rounded-xl\b/);
  });

  it("injects a viewer-only stylesheet into the iframe srcDoc to tame the A4 margins for inline reading", async () => {
    const baseHtml = `<!doctype html><html><head><style>body{margin:2cm}</style></head><body>Body</body></html>`;
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(baseHtml, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    render(wrap(<ContractViewerModal contract={baseTemplateContract} onClose={() => {}} />));

    const iframe = (await screen.findByTestId(
      "contract-viewer-iframe",
    )) as HTMLIFrameElement;
    const srcdoc = iframe.getAttribute("srcdoc") ?? "";
    // The viewer injects a centered max-78ch text column so the body isn't
    // a 1100px wall of text inside a 1260px modal.
    expect(srcdoc).toMatch(/max-width:\s*78ch/);
    // ... and a small-viewport override so mobile readers don't get a 2cm
    // margin eating 40% of a 375px iPhone screen.
    expect(srcdoc).toMatch(/@media \(max-width:\s*600px\)/);
    // Original A4 margin from the renderer must still be present — only the
    // PDF cares about that, but proving we left it intact catches accidental
    // replace-all bugs.
    expect(srcdoc).toMatch(/margin:\s*2cm/);
  });

  it("surfaces a fallback error message + PDF link when /render fails", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );

    render(wrap(<ContractViewerModal contract={baseTemplateContract} onClose={() => {}} />));

    await waitFor(() => {
      expect(screen.getByText(/couldn't load the contract/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /open pdf instead/i })).toHaveAttribute(
      "href",
      baseTemplateContract.documentUrl!,
    );
  });
});
