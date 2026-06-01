// @vitest-environment jsdom
/**
 * Behaviour tests for FileViewerModal — the generic in-app file viewer used
 * across Documents, Certifications, Qualifications and Contracts.
 *
 * Coverage:
 *   - PDF route: iframe src points at the viewerUrl proxy
 *   - Image route (jpg/png/etc): <img> not <iframe>
 *   - Unknown route: fallback panel with Download + Open externally
 *   - File extension is sniffed from `fileName` when given; falls back to URL
 *   - Escape key closes
 *   - Backdrop click closes; click on the dialog body does NOT close
 *   - Body scroll lock is engaged while open
 *   - `open={false}` renders nothing (no portal)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { FileViewerModal } from "@/components/files/FileViewerModal";

const baseProps = {
  open: true,
  onClose: () => {},
  title: "WWCC — Al Himma",
  viewerUrl: "/api/compliance/cert-1/download",
  downloadUrl: "/api/compliance/cert-1/download?download=1",
};

afterEach(() => {
  document.body.style.overflow = "";
});

describe("FileViewerModal", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <FileViewerModal {...baseProps} open={false} />,
    );
    // Portaled into body, but if open is false the component returns null.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector("[data-testid=file-viewer-overlay]")).toBeNull();
  });

  it("PDF: renders an iframe with src pointing at the proxy", () => {
    render(<FileViewerModal {...baseProps} fileName="cert.pdf" />);
    const iframe = screen.getByTestId("file-viewer-iframe");
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe.getAttribute("src")).toBe(baseProps.viewerUrl);
    expect(screen.queryByTestId("file-viewer-image")).toBeNull();
  });

  it("image: renders an <img> not an iframe", () => {
    render(<FileViewerModal {...baseProps} fileName="cert-photo.jpg" />);
    const img = screen.getByTestId("file-viewer-image") as HTMLImageElement;
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe(baseProps.viewerUrl);
    expect(screen.queryByTestId("file-viewer-iframe")).toBeNull();
  });

  it("unknown extension: shows fallback panel with Download + Open externally", () => {
    render(<FileViewerModal {...baseProps} fileName="report.docx" />);
    const fallback = screen.getByTestId("file-viewer-fallback");
    expect(fallback).toBeInTheDocument();
    // Scope queries to the fallback panel so the header's own Download link
    // (which also matches /^Download$/i) doesn't make the role query
    // ambiguous and throw "Found multiple elements".
    const { getByRole } = within(fallback);
    expect(getByRole("link", { name: /Open externally/i })).toHaveAttribute(
      "href",
      baseProps.viewerUrl,
    );
    expect(getByRole("link", { name: /^Download$/i })).toHaveAttribute(
      "href",
      baseProps.downloadUrl,
    );
  });

  it("falls back to URL extension when no fileName is given", () => {
    render(
      <FileViewerModal
        {...baseProps}
        fileName={undefined}
        viewerUrl="/api/staff-documents/abc/file.PDF"
      />,
    );
    expect(screen.getByTestId("file-viewer-iframe")).toBeInTheDocument();
  });

  it("Download button in the header carries the downloadUrl", () => {
    render(<FileViewerModal {...baseProps} fileName="cert.pdf" />);
    const dl = screen.getByTestId("file-viewer-download");
    expect(dl.getAttribute("href")).toBe(baseProps.downloadUrl);
  });

  it("omits the Download button when no downloadUrl is provided", () => {
    render(
      <FileViewerModal
        {...baseProps}
        downloadUrl={undefined}
        fileName="cert.pdf"
      />,
    );
    expect(screen.queryByTestId("file-viewer-download")).toBeNull();
  });

  it("Escape closes the modal", () => {
    const onClose = vi.fn();
    render(<FileViewerModal {...baseProps} onClose={onClose} fileName="cert.pdf" />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking the backdrop closes; clicking inside the dialog does NOT close", () => {
    const onClose = vi.fn();
    render(<FileViewerModal {...baseProps} onClose={onClose} fileName="cert.pdf" />);
    const overlay = screen.getByTestId("file-viewer-overlay");
    const dialog = screen.getByTestId("file-viewer-dialog");

    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("locks document.body scroll while open and restores on unmount", () => {
    document.body.style.overflow = ""; // baseline
    const { unmount } = render(
      <FileViewerModal {...baseProps} fileName="cert.pdf" />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("mobile-first sizing classes match the spec: full-screen on mobile, 90vw × 90vh capped on desktop", () => {
    render(<FileViewerModal {...baseProps} fileName="cert.pdf" />);
    const dialog = screen.getByTestId("file-viewer-dialog");
    expect(dialog.className).toMatch(/\bw-full\b/);
    expect(dialog.className).toMatch(/\bh-full\b/);
    // No trailing `\b` after `]` — `]` is non-word and the next char is
    // whitespace, so the boundary never matches.
    expect(dialog.className).toContain("sm:w-[90vw]");
    expect(dialog.className).toContain("sm:h-[90vh]");
    expect(dialog.className).toContain("sm:max-w-[1400px]");
  });
});
