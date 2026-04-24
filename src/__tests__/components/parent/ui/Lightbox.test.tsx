// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Lightbox } from "@/components/parent/ui/Lightbox";

const urls = [
  "https://abcd.public.blob.vercel-storage.com/message-attachments/img-0.jpg",
  "https://abcd.public.blob.vercel-storage.com/message-attachments/img-1.jpg",
  "https://abcd.public.blob.vercel-storage.com/message-attachments/img-2.jpg",
];

describe("Lightbox", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("renders nothing when index is null", () => {
    const { container } = render(
      <Lightbox urls={urls} index={null} onChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the image at the given index with a counter", () => {
    render(<Lightbox urls={urls} index={1} onChange={() => {}} />);
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toContain("img-1.jpg");
    expect(screen.getByText("2 / 3")).toBeTruthy();
  });

  it("fires onChange(null) when Escape is pressed", () => {
    const onChange = vi.fn();
    render(<Lightbox urls={urls} index={0} onChange={onChange} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("cycles to the next index on ArrowRight", () => {
    const onChange = vi.fn();
    render(<Lightbox urls={urls} index={0} onChange={onChange} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("wraps to the last index on ArrowLeft from index 0", () => {
    const onChange = vi.fn();
    render(<Lightbox urls={urls} index={0} onChange={onChange} />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it("hides prev/next controls when there is only one image", () => {
    render(
      <Lightbox
        urls={[urls[0]!]}
        index={0}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /previous image/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /next image/i })).toBeNull();
  });
});
