// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BriefTable } from "@/components/marketing/vendor-briefs/brief-table";
import type { VendorBriefListItem } from "@/hooks/useVendorBriefs";

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

const baseBrief: VendorBriefListItem = {
  id: "vb1",
  briefNumber: "VB-2026-0001",
  title: "Greystanes posters",
  type: "print_collateral",
  status: "brief_sent",
  serviceId: "svc1",
  serviceName: "Greystanes",
  vendorContactId: "vc1",
  vendorContactName: "Jinan",
  ownerId: "m1",
  ownerName: "Akram",
  termYear: null,
  termNumber: null,
  termReadinessCategory: null,
  briefSentAt: new Date().toISOString(),
  acknowledgedAt: null,
  quoteReceivedAt: null,
  approvedAt: null,
  orderedAt: null,
  deliveredAt: null,
  installedAt: null,
  deliveryDeadline: null,
  targetTermStart: null,
  escalatedAt: null,
  escalatedToUserId: null,
  slaState: "on_track",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("BriefTable", () => {
  it("renders briefs with brief number, title, status, and SLA", () => {
    render(
      <BriefTable
        briefs={[baseBrief]}
        onOpenBrief={vi.fn()}
      />,
    );

    expect(screen.getByText("VB-2026-0001")).toBeTruthy();
    expect(screen.getByText("Greystanes posters")).toBeTruthy();
    expect(screen.getByText("Greystanes")).toBeTruthy();
    expect(screen.getByText("Jinan")).toBeTruthy();
    expect(screen.getByText("Brief sent")).toBeTruthy();
    expect(screen.getAllByText("On track").length).toBeGreaterThan(0);
  });

  it("calls onOpenBrief when a row is clicked", () => {
    const onOpenBrief = vi.fn();
    render(
      <BriefTable briefs={[baseBrief]} onOpenBrief={onOpenBrief} />,
    );
    fireEvent.click(screen.getByText("Greystanes posters"));
    expect(onOpenBrief).toHaveBeenCalledWith("vb1");
  });

  it("shows escalated badge when escalatedAt is set", () => {
    render(
      <BriefTable
        briefs={[{ ...baseBrief, escalatedAt: new Date().toISOString() }]}
        onOpenBrief={vi.fn()}
      />,
    );
    expect(screen.getByText("escalated")).toBeTruthy();
  });

  it("shows 'Portfolio' italic for briefs without a service", () => {
    render(
      <BriefTable
        briefs={[{ ...baseBrief, serviceId: null, serviceName: null }]}
        onOpenBrief={vi.fn()}
      />,
    );
    expect(screen.getByText("Portfolio")).toBeTruthy();
  });

  it("shows the SLA pill for ack_overdue with severity styling", () => {
    render(
      <BriefTable
        briefs={[{ ...baseBrief, slaState: "ack_overdue" }]}
        onOpenBrief={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Ack overdue").length).toBeGreaterThan(0);
  });

  it("renders an empty state when no briefs match", () => {
    render(<BriefTable briefs={[]} onOpenBrief={vi.fn()} />);
    expect(screen.getByText(/No briefs match/i)).toBeTruthy();
  });
});
