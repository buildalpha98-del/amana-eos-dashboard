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
      expect(iframe.getAttribute("srcdoc")).toBe(html);
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

    const btn = await screen.findByTestId("contract-viewer-acknowledge");
    fireEvent.click(btn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/contracts/ct-1/acknowledge",
        expect.objectContaining({ method: "POST" }),
      );
    });

    // Footer transitions to "Acknowledged just now" and the button is gone.
    await waitFor(() => {
      expect(screen.getByText(/acknowledged just now/i)).toBeInTheDocument();
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
    expect(screen.getByText(/acknowledged on/i)).toBeInTheDocument();
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

  it("on small viewports the modal uses full-screen layout (no rounded corners or sm:rounded-xl absent)", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    );

    render(wrap(<ContractViewerModal contract={baseTemplateContract} onClose={() => {}} />));

    const dialog = await screen.findByRole("dialog");
    // Tailwind classes encoding mobile-first sizing: `h-full sm:h-auto`
    // means the dialog fills the screen on small viewports and shrinks at sm+.
    expect(dialog.className).toMatch(/\bh-full\b/);
    expect(dialog.className).toMatch(/\bsm:rounded-xl\b/);
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
