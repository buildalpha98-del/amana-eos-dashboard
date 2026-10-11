// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { AttendanceReport } from "@/components/reports/AttendanceReport";
import { BookingsReport } from "@/components/reports/BookingsReport";
import { RevenueReport } from "@/components/reports/RevenueReport";
import { EnrolmentsReport } from "@/components/reports/EnrolmentsReport";
import { MedicalAlertsReport } from "@/components/reports/MedicalAlertsReport";

vi.mock("@/lib/fetch-api", () => ({ fetchApi: vi.fn() }));
const params = "serviceId=synthetic-centre&dateFrom=2026-10-01&dateTo=2026-10-07";
const child = { id: "synthetic-child", firstName: "Synthetic", lastName: "Child", dateOfBirth: "2020-01-01", serviceName: "Synthetic Centre", medicalConditions: ["Asthma"], dietaryRequirements: [], medicationDetails: "Inhaler", anaphylaxisActionPlan: null, additionalNeeds: null };
const reports = [
  { name: "attendance", ui: <AttendanceReport params={params} />, data: { totalExpected: 5, totalSignedIn: 4, totalSignedOut: 4, lateSignOuts: 0, noShows: 1, byDay: [], bySessionType: [] }, visible: "Expected", key: ["report-attendance", params], url: `/api/reports/attendance?${params}` },
  { name: "bookings", ui: <BookingsReport params={params} />, data: { totalBookings: 5, byStatus: {}, bySessionType: {}, casualVsPermanent: { casual: 1, permanent: 4 }, averageApprovalTimeHours: 2 }, visible: "Total Bookings", key: ["report-bookings", params], url: `/api/reports/bookings?${params}` },
  { name: "revenue", ui: <RevenueReport params={params} />, data: { totalGrossFees: 100, totalCcsEstimate: 20, totalGapFees: 80, totalPaymentsReceived: 50, totalOutstanding: 30, overdueCount: 0, byWeek: [], byService: [] }, visible: "Gross Fees", key: ["report-revenue", params], url: `/api/reports/revenue?${params}` },
  { name: "enrolments", ui: <EnrolmentsReport params={params} />, data: { totalApplications: 5, byStatus: {}, approvalRate: 80, averageApprovalTimeHours: 2, byService: [], byMonth: [] }, visible: "Total Applications", key: ["report-enrolments", params], url: `/api/reports/enrolments?${params}` },
  { name: "medical alerts", ui: <MedicalAlertsReport serviceId="synthetic-centre" />, data: [child], visible: "Synthetic Child", key: ["report-medical-alerts", "synthetic-centre"], url: "/api/reports/medical-alerts?serviceId=synthetic-centre" },
];
const clients: QueryClient[] = [];
function show(ui: ReactNode, cached?: { key: string[]; data: unknown }) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } } });
  clients.push(client);
  if (cached) client.setQueryData(cached.key, cached.data);
  const view = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { ...view, client };
}
beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients.length = 0; });

describe("report failure recovery", () => {
  it.each(reports)("$name shows an initial error and retries the same filters", async (report) => {
    vi.mocked(fetchApi).mockRejectedValue(new Error("Synthetic server failure"));
    show(report.ui);
    expect(await screen.findByRole("alert")).toHaveTextContent(`Unable to load ${report.name} report`);
    expect(screen.queryByText("No children with medical alerts found.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Export CSV" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Print" })).not.toBeInTheDocument();
    let finish!: (data: unknown) => void;
    vi.mocked(fetchApi).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const retry = screen.getByRole("button", { name: "Try Again" });
    retry.focus(); expect(document.activeElement).toBe(retry); fireEvent.click(retry);
    await waitFor(() => expect(fetchApi).toHaveBeenLastCalledWith(report.url));
    await act(async () => { finish(report.data); });
    expect(await screen.findByText(report.visible)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(reports)("$name retains cached results with a warning until refresh succeeds", async (report) => {
    vi.mocked(fetchApi).mockRejectedValue(new Error("Refresh failed"));
    const { client } = show(report.ui, report);
    expect(screen.getByText(report.visible)).toBeInTheDocument();
    await act(async () => { await client.invalidateQueries({ queryKey: report.key }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Showing previously loaded results");
    expect(screen.getByText(report.visible)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Export CSV" })).not.toBeInTheDocument();
    if (report.name === "medical alerts") expect(screen.getByRole("button", { name: "Print" })).toBeDisabled();
    let finish!: (data: unknown) => void;
    vi.mocked(fetchApi).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Retrying report");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await act(async () => { finish(report.data); });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    if (report.name === "medical alerts") expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
  });

  it("distinguishes a successful empty medical report from a failed request", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);
    show(<MedicalAlertsReport serviceId="synthetic-centre" />);
    expect(await screen.findByText("No children with medical alerts found.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
  });

  it("preserves medical search through failed refresh and recovery", async () => {
    vi.mocked(fetchApi).mockRejectedValue(new Error("Refresh failed"));
    const { client } = show(<MedicalAlertsReport serviceId="synthetic-centre" />, { key: ["report-medical-alerts", "synthetic-centre"], data: [child] });
    fireEvent.change(screen.getByPlaceholderText("Search by name or condition..."), { target: { value: "Asthma" } });
    await act(async () => { await client.invalidateQueries({ queryKey: ["report-medical-alerts"] }); });
    await screen.findByRole("alert");
    vi.mocked(fetchApi).mockResolvedValue([child]);
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByPlaceholderText("Search by name or condition...")).toHaveValue("Asthma");
    expect(screen.getByText("Synthetic Child")).toBeInTheDocument();
  });
});
