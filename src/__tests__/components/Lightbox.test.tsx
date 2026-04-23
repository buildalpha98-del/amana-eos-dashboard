// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Lightbox } from "@/components/parent/ui/Lightbox";

const urls = [
  "https://abc.public.blob.vercel-storage.com/a.jpg",
  "https://abc.public.blob.vercel-storage.com/b.jpg",
  "https://abc.public.blob.vercel-storage.com/c.jpg",
];

describe("Lightbox", () => {
  it("renders nothing when openIndex is null", () => {
    const { container } = render(
      <Lightbox urls={urls} openIndex={null} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the image at openIndex with a counter", () => {
    render(<Lightbox urls={urls} openIndex={1} onClose={() => {}} />);
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /photo 2 of 3/i })).toHaveAttribute(
      "src",
      urls[1],
    );
  });

  it("ArrowRight advances to the next image", () => {
    render(<Lightbox urls={urls} openIndex={0} onClose={() => {}} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("ArrowLeft goes to the previous image", () => {
    render(<Lightbox urls={urls} openIndex={2} onClose={() => {}} />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("ArrowLeft at index 0 stays at 0 (no wraparound)", () => {
    render(<Lightbox urls={urls} openIndex={0} onClose={() => {}} />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("ArrowRight at last index stays at last (no wraparound)", () => {
    render(<Lightbox urls={urls} openIndex={2} onClose={() => {}} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<Lightbox urls={urls} openIndex={0} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the backdrop calls onClose", () => {
    const onClose = vi.fn();
    render(<Lightbox urls={urls} openIndex={0} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("lightbox-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the image itself does NOT close", () => {
    const onClose = vi.fn();
    render(<Lightbox urls={urls} openIndex={0} onClose={onClose} />);
    fireEvent.click(screen.getByRole("img", { name: /photo 1 of 3/i }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Previous button is hidden at index 0", () => {
    render(<Lightbox urls={urls} openIndex={0} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();
  });

  it("Next button is hidden at the last index", () => {
    render(<Lightbox urls={urls} openIndex={2} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
  });

  it("Next button advances when clicked", () => {
    render(<Lightbox urls={urls} openIndex={0} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("Close button calls onClose", () => {
    const onClose = vi.fn();
    render(<Lightbox urls={urls} openIndex={0} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
