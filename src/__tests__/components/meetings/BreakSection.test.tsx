// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BreakSection } from "@/components/meetings/BreakSection";

describe("BreakSection", () => {
  it("renders the break interstitial", () => {
    render(<BreakSection />);
    expect(screen.getByText(/Take a 10 minute break/i)).toBeInTheDocument();
  });
});
