// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelinePostMedia } from "@/components/parent/TimelinePostMedia";

// next/image renders as <img> in jsdom, but we stub it to a plain <img> so
// role-based queries find it without Next's intersection observer etc. We
// also drop the `fill`/`sizes` next-only props that would otherwise warn.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    sizes?: string;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt || "Gallery photo"} className={className} />
  ),
}));

function urls(n: number): string[] {
  return Array.from(
    { length: n },
    (_, i) => `https://abc.public.blob.vercel-storage.com/img-${i}.jpg`,
  );
}

describe("TimelinePostMedia layouts", () => {
  it("renders nothing for 0 images", () => {
    const { container } = render(
      <TimelinePostMedia urls={[]} onOpen={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("single: one 16:9 tile, layout='single'", () => {
    render(<TimelinePostMedia urls={urls(1)} onOpen={() => {}} />);
    expect(screen.getByTestId("gallery")).toHaveAttribute(
      "data-layout",
      "single",
    );
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("double: two 1:1 tiles, layout='double'", () => {
    render(<TimelinePostMedia urls={urls(2)} onOpen={() => {}} />);
    expect(screen.getByTestId("gallery")).toHaveAttribute(
      "data-layout",
      "double",
    );
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("triple: one large + two stacked, layout='triple'", () => {
    render(<TimelinePostMedia urls={urls(3)} onOpen={() => {}} />);
    expect(screen.getByTestId("gallery")).toHaveAttribute(
      "data-layout",
      "triple",
    );
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("quad: 2x2 grid, layout='quad'", () => {
    render(<TimelinePostMedia urls={urls(4)} onOpen={() => {}} />);
    expect(screen.getByTestId("gallery")).toHaveAttribute(
      "data-layout",
      "quad",
    );
    expect(screen.getAllByRole("img")).toHaveLength(4);
  });

  it("5 images: 2x2 quad with +1 overlay on the 4th tile", () => {
    render(<TimelinePostMedia urls={urls(5)} onOpen={() => {}} />);
    expect(screen.getByTestId("gallery")).toHaveAttribute(
      "data-layout",
      "quad",
    );
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("6 images: 2x2 quad with +2 overlay", () => {
    render(<TimelinePostMedia urls={urls(6)} onOpen={() => {}} />);
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("clicking a tile calls onOpen with the tapped index", () => {
    const onOpen = vi.fn();
    render(<TimelinePostMedia urls={urls(3)} onOpen={onOpen} />);
    const tiles = screen.getAllByRole("button", { name: /view photo/i });
    tiles[1].click();
    expect(onOpen).toHaveBeenCalledWith(1);
  });
});
