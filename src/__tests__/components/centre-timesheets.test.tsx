// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { CentreTimesheets } from "@/components/services/staff/CentreTimesheets";

const state = vi.hoisted(() => ({
  role: "member", centre: true, serviceId: "svc-1", submitter: "staff-1", status: "submitted", approved: vi.fn(), error: false,
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "viewer", role: state.role, isCentreAccount: state.centre, serviceId: state.serviceId } } }) }));
vi.mock("@/hooks/useRosterShifts", () => ({ useRosterShifts: () => ({ data: { shifts: [] }, refetch: vi.fn(), isLoading: false, isError: false }) }));
vi.mock("@/hooks/useTimesheets", () => ({
  useTimesheets: () => ({ data: [{ id: "ts1", serviceId: "svc-1", status: state.status, submittedById: state.submitter, _count: { entries: 1 } }], isLoading: false, isError: false }),
  useTimesheet: () => ({ data: { entries: [{ id: "entry1", user: { name: "Test Educator" }, date: "2026-10-09", shiftStart: "2026-10-09T04:00:00Z", shiftEnd: "2026-10-09T07:00:00Z", totalHours: 2.5, breakMinutes: 30 }] }, isError: state.error, refetch: vi.fn() }),
  useSubmitTimesheet: () => ({ mutate: vi.fn() }),
  useApproveTimesheet: () => ({ mutate: state.approved }),
  useGenerateFromTimeclock: () => ({ mutate: vi.fn() }),
}));

afterEach(cleanup);
beforeEach(() => { state.role = "member"; state.centre = true; state.serviceId = "svc-1"; state.submitter = "staff-1"; state.status = "submitted"; state.error = false; vi.clearAllMocks(); });

describe("centre timesheet approval controls", () => {
  it("lets the centre review saved paid hours and approve another submitter", () => {
    render(<CentreTimesheets serviceId="svc-1" />);
    expect(screen.getByText("2.50 paid hours")).toBeTruthy();
    expect(screen.getByText("30 min break")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve timesheet" }));
    expect(state.approved).toHaveBeenCalledWith("ts1");
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
  });
  it("prevents self-approval and explains who must approve", () => {
    state.submitter = "viewer";
    render(<CentreTimesheets serviceId="svc-1" />);
    expect((screen.getByRole("button", { name: "Approve timesheet" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Another approver needs to sign it off/)).toBeTruthy();
  });
  it("does not approve when saved payroll entries cannot be loaded", () => {
    state.error = true;
    render(<CentreTimesheets serviceId="svc-1" />);
    expect((screen.getByRole("button", { name: "Approve timesheet" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
  it("offers CSV export to office and hides approval from educators", () => {
    state.role = "owner";
    const { unmount } = render(<CentreTimesheets serviceId="svc-1" />);
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeTruthy();
    unmount();
    state.role = "staff"; state.centre = false;
    render(<CentreTimesheets serviceId="svc-1" />);
    expect(screen.queryByRole("button", { name: "Approve timesheet" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
  });
});
