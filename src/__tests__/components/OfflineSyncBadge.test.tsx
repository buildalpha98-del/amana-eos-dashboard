// @vitest-environment jsdom
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  owner: "u1",
  review: vi.fn(async () => {}),
  drain: vi.fn(async () => {}),
  rows: [
    {
      id: "a1",
      ownerId: "u1",
      status: "failed",
      attempts: 3,
      enqueuedAt: 1000,
      url: "/api/attendance/roll-call",
      body: { action: "sign_in", childId: "child-private" },
      lastError: "Check arrival",
    },
  ],
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: mocks.owner } } }),
}));
vi.mock("@/lib/offline-queue", () => ({
  offlineQueue: {
    all: async () => mocks.rows,
    subscribe: (listener: () => void) => {
      listener();
      return () => {};
    },
    review: mocks.review,
    drain: mocks.drain,
  },
}));
import { OfflineSyncBadge } from "@/components/layout/OfflineSyncBadge";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner = "u1";
});
afterEach(cleanup);
it("requires record review before retrying a failed action", async () => {
  render(<OfflineSyncBadge />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Review offline saves" }),
  );
  expect(await screen.findByText("Check arrival")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Review retry" }));
  expect(
    (screen.getByRole("button", { name: "Allow retry" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Allow retry" }));
  await waitFor(() =>
    expect(mocks.review).toHaveBeenCalledWith("a1", "u1", "retry"),
  );
  expect(mocks.drain).not.toHaveBeenCalled();
});
it("removes old account content when the login changes", async () => {
  const { rerender } = render(<OfflineSyncBadge />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Review offline saves" }),
  );
  expect(await screen.findByText(/child-private/)).toBeTruthy();
  mocks.owner = "u2";
  rerender(<OfflineSyncBadge />);
  await waitFor(() => expect(screen.queryByText(/child-private/)).toBeNull());
});
it("shows sync errors and allows another attempt", async () => {
  mocks.drain.mockRejectedValueOnce(new Error("Connection unavailable"));
  render(<OfflineSyncBadge />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Review offline saves" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Sync pending saves" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Connection unavailable",
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Sync pending saves",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
