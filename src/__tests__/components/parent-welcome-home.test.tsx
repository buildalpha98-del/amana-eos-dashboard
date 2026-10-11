// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ParentWelcomeHome } from "@/components/parent/ParentWelcomeHome";
import { fetchApi } from "@/lib/fetch-api";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/fetch-api", () => ({ fetchApi: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function mount(state: string) {
  vi.mocked(fetchApi).mockImplementation(async (url) =>
    url === "/api/parent/state"
      ? { state }
      : {
          centres: [
            {
              id: "greenacre",
              name: "Amana OSHC MFIS Greenacre",
              address: "Greenacre",
            },
          ],
        },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ParentWelcomeHome />
    </QueryClientProvider>,
  );
}
describe("Amana welcome home", () => {
  it("shows pending review without claiming OWNA access or a confirmed place", async () => {
    mount("pending_review");
    expect(
      await screen.findByText("Your enrolment is with our team."),
    ).toBeVisible();
    expect(
      screen.queryByText("Your family has a confirmed enrolment."),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "Enrol another child" }),
    ).toHaveAttribute("href", "/parent/children/new");
    expect(
      screen.getByRole("link", { name: /Need your OWNA invitation/ }),
    ).toHaveAttribute("href", "/parent/messages");
    expect(
      screen.getByRole("link", { name: /Amana OSHC MFIS Greenacre/ }),
    ).toHaveAttribute("href", "/parent/my-centre?centre=greenacre");
  });
  it("does not treat a family's active status as every child's approval or OWNA readiness", async () => {
    mount("active");
    expect(
      await screen.findByText("Your family has a confirmed enrolment."),
    ).toBeVisible();
    expect(screen.getByText(/another child’s enrolment/)).toBeVisible();
    expect(
      screen.getByText(
        /make sure your OWNA access and booked sessions are confirmed/,
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /book now|pay now/i }),
    ).toBeNull();
  });
  it("reports a failed status request rather than showing a false pending or approved status", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(fetchApi).mockImplementation(async (url) => {
      if (url === "/api/parent/state") throw new Error("offline");
      return { centres: [] };
    });
    render(
      <QueryClientProvider client={client}>
        <ParentWelcomeHome />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "couldn’t load your enrolment status",
      ),
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(
      screen.queryByText("Your family has a confirmed enrolment."),
    ).toBeNull();
    expect(screen.getByRole("link", { name: /Ask our team/ })).toHaveAttribute(
      "href",
      "/support",
    );
  });
});
