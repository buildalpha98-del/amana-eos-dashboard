// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { PullSheet } from "@/components/parent/ui/PullSheet";

describe("PullSheet", () => {
  it("renders children when open", () => {
    const { getByText } = render(
      <PullSheet open onOpenChange={vi.fn()}>
        <div>hello sheet</div>
      </PullSheet>,
    );
    expect(getByText("hello sheet")).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    const { queryByText } = render(
      <PullSheet open={false} onOpenChange={vi.fn()}>
        <div>hello sheet</div>
      </PullSheet>,
    );
    expect(queryByText("hello sheet")).toBeNull();
  });
});
