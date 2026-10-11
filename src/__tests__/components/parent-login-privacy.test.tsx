// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PerformanceInsights } from "@/components/PerformanceInsights";

const mocks = vi.hoisted(() => ({ pathname: "/parent/login/confirm", init: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@vercel/speed-insights/next", () => ({ SpeedInsights: () => <div data-testid="performance-monitor" /> }));
vi.mock("@sentry/nextjs", () => ({ init: mocks.init }));

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
describe("login credential privacy before hydration", () => {
  it("does not mount performance monitoring on the confirmation page", () => {
    mocks.pathname = "/parent/login/confirm";
    render(<PerformanceInsights />);
    expect(screen.queryByTestId("performance-monitor")).toBeNull();
  });
  it("continues performance monitoring on other pages", () => {
    mocks.pathname = "/parent";
    render(<PerformanceInsights />);
    expect(screen.getByTestId("performance-monitor")).toBeInTheDocument();
  });
  it.each([["/parent/login/confirm#token=sensitive-test-token", false], ["/parent", true]])("Sentry initializes at %s with enabled=%s", async (path, enabled) => {
    vi.resetModules();
    mocks.init.mockClear();
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/1");
    window.history.replaceState(null, "", path);
    await import("../../../sentry.client.config");
    expect(mocks.init).toHaveBeenCalledWith(expect.objectContaining({ enabled }));
  });
});
