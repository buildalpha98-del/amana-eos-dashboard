// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CustodyChip } from "@/components/children/CustodyChip";

describe("CustodyChip", () => {
  it("renders nothing when custody is null", () => {
    const { container } = render(<CustodyChip custody={null} />);
    expect(container.textContent).toBe("");
  });

  it("renders chip with type label and opens dialog on click", () => {
    render(
      <CustodyChip
        custody={{ type: "court_order", primaryGuardian: "Sarah" }}
        childName="Amelia"
      />,
    );
    const chip = screen.getByRole("button", { name: /View custody arrangements/i });
    expect(chip.textContent).toContain("Court order");

    fireEvent.click(chip);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Sarah");
    expect(dialog.textContent).toContain("Amelia");
  });

  it("compact mode shows generic 'Custody' label for non-court types", () => {
    render(<CustodyChip custody={{ type: "shared" }} compact />);
    const chip = screen.getByRole("button", { name: /View custody arrangements/i });
    expect(chip.textContent).toContain("Custody");
  });

  it("compact mode still shows 'Court order' explicitly so it draws the eye", () => {
    render(<CustodyChip custody={{ type: "court_order" }} compact />);
    const chip = screen.getByRole("button", { name: /View custody arrangements/i });
    expect(chip.textContent).toContain("Court order");
  });

  it("dialog closes via close button", () => {
    render(<CustodyChip custody={{ type: "shared" }} />);
    fireEvent.click(
      screen.getByRole("button", { name: /View custody arrangements/i }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders court-order URL link when present", () => {
    render(
      <CustodyChip
        custody={{
          type: "court_order",
          courtOrderUrl: "https://example.com/order.pdf",
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /View custody arrangements/i }),
    );
    const link = screen.getByRole("link", { name: /View document/i });
    expect(link.getAttribute("href")).toBe("https://example.com/order.pdf");
  });
});
