// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CommandMenu } from "@/components/ui/v2/CommandMenu";

// ── Mock next/navigation ─────────────────────────────────
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/dashboard",
}));

function openMenu() {
  fireEvent.keyDown(window, { key: "k", metaKey: true });
}

describe("CommandMenu", () => {
  beforeEach(() => {
    pushMock.mockReset();
    cleanup();
  });

  it("is closed by default", () => {
    render(<CommandMenu role="owner" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on ⌘K", () => {
    render(<CommandMenu role="owner" />);
    openMenu();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText("Search commands")).toBeTruthy();
  });

  it("closes on Escape", () => {
    render(<CommandMenu role="owner" />);
    openMenu();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("gates actions by role — admin sees 'Generate Weekly Newsletter', member does not", () => {
    // Admin view
    const { unmount } = render(<CommandMenu role="admin" />);
    openMenu();
    expect(screen.queryByText("Generate Weekly Newsletter")).toBeTruthy();
    unmount();

    // Member view (no admin-up gate passes)
    render(<CommandMenu role="member" />);
    openMenu();
    expect(screen.queryByText("Generate Weekly Newsletter")).toBeNull();
  });

  it("filters results when a query is typed", () => {
    render(<CommandMenu role="owner" />);
    openMenu();
    const input = screen.getByLabelText("Search commands") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "observation" } });
    expect(screen.getByText("Log Observation")).toBeTruthy();
    // Create Rock should no longer be in the results
    expect(screen.queryByText("Create Rock")).toBeNull();
  });

  it("shows no-match message when query matches nothing", () => {
    render(<CommandMenu role="owner" />);
    openMenu();
    const input = screen.getByLabelText("Search commands") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzzz_no_match_xxxx" } });
    expect(screen.getByText(/No commands match/i)).toBeTruthy();
  });

  it("runs action handler on Enter and closes", () => {
    render(<CommandMenu role="owner" />);
    openMenu();
    const input = screen.getByLabelText("Search commands") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "create rock" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(pushMock).toHaveBeenCalledWith("/rocks?create=1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("navigates to a nav item on click", () => {
    render(<CommandMenu role="owner" />);
    openMenu();
    const input = screen.getByLabelText("Search commands") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "roll-call" } });
    // Both the action "Roll Call — Today" and the nav row exist — click the nav one in the "Go to" group
    // Easier: click something unambiguous, "vision"
    fireEvent.change(input, { target: { value: "vision" } });
    const row = screen.getByText("Vision / V-TO");
    fireEvent.click(row);
    expect(pushMock).toHaveBeenCalledWith("/vision");
  });

  it("arrow keys move selection and Enter fires the highlighted item", () => {
    render(<CommandMenu role="owner" />);
    openMenu();
    const input = screen.getByLabelText("Search commands") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "create" } });
    // ArrowDown once, then Enter — should fire the second result
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(pushMock).toHaveBeenCalledOnce();
  });
});
