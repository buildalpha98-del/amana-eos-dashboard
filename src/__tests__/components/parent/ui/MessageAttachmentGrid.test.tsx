// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageAttachmentGrid } from "@/components/parent/ui/MessageAttachmentGrid";

if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => {};
}

const urls = (n: number) =>
  Array.from(
    { length: n },
    (_, i) =>
      `https://abcd.public.blob.vercel-storage.com/message-attachments/img-${i}.jpg`,
  );

describe("MessageAttachmentGrid", () => {
  beforeEach(() => {
    // Reset body overflow if a previous test opened the lightbox.
    document.body.style.overflow = "";
  });

  it("renders nothing when given an empty list", () => {
    const { container } = render(<MessageAttachmentGrid urls={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a single image as one tile", () => {
    render(<MessageAttachmentGrid urls={urls(1)} />);
    const tiles = screen.getAllByRole("button", {
      name: /Open attachment/i,
    });
    expect(tiles).toHaveLength(1);
  });

  it("renders three images in a three-tile grid", () => {
    render(<MessageAttachmentGrid urls={urls(3)} />);
    const tiles = screen.getAllByRole("button", {
      name: /Open attachment/i,
    });
    expect(tiles).toHaveLength(3);
  });

  it("renders four images as a 2x2 grid without overlay", () => {
    render(<MessageAttachmentGrid urls={urls(4)} />);
    const tiles = screen.getAllByRole("button", {
      name: /Open attachment/i,
    });
    expect(tiles).toHaveLength(4);
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it("shows a +N overlay on the last tile when count > 4", () => {
    render(<MessageAttachmentGrid urls={urls(6)} />);
    const tiles = screen.getAllByRole("button", {
      name: /Open attachment/i,
    });
    // Only 4 tiles are shown; the last one carries the overlay.
    expect(tiles).toHaveLength(4);
    expect(screen.getByText("+2")).toBeTruthy();
  });

  it("opens the lightbox when a tile is clicked", () => {
    render(<MessageAttachmentGrid urls={urls(2)} />);
    // Before click: no dialog
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /Open attachment/i })[0]!);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-label")).toBe("Attachment viewer");
  });
});
