// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Avatar, gradientFor } from "@/components/ui/v2";

describe("Avatar", () => {
  it("renders initial from name when no src", () => {
    const { getByText } = render(<Avatar name="Sophia Kowaider" />);
    expect(getByText("S")).toBeInTheDocument();
  });

  it("produces deterministic gradient for same seed (hydration stability)", () => {
    const { container: a } = render(<Avatar name="Sophia" seed="child-abc" />);
    const { container: b } = render(<Avatar name="Sophia" seed="child-abc" />);
    const gradA = (a.firstChild as HTMLElement).style.background;
    const gradB = (b.firstChild as HTMLElement).style.background;
    expect(gradA).toBe(gradB);
    expect(gradA).toMatch(/^linear-gradient\(135deg/);
  });

  it("gradientFor helper is pure and deterministic", () => {
    expect(gradientFor("child-abc")).toBe(gradientFor("child-abc"));
  });

  it("produces different gradients for different seeds (usually)", () => {
    // Not guaranteed (6 buckets), but these two seeds are picked to land on different buckets
    const a = gradientFor("aaa");
    const b = gradientFor("zzz");
    expect(a).not.toBe(b);
  });

  it("renders <img> when src provided", () => {
    const { container } = render(<Avatar name="X" src="/p.jpg" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/p.jpg");
    expect(img).toHaveAttribute("alt", "X");
  });

  it("respects size prop", () => {
    const { container } = render(<Avatar name="X" size="lg" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("w-12");
    expect(el.className).toContain("h-12");
  });

  it("uppercases the initial", () => {
    const { getByText } = render(<Avatar name="sophia" />);
    expect(getByText("S")).toBeInTheDocument();
  });

  it("falls back to ? for empty name", () => {
    const { getByText } = render(<Avatar name="   " />);
    expect(getByText("?")).toBeInTheDocument();
  });
});
