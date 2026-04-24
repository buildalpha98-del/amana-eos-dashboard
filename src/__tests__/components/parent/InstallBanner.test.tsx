// @vitest-environment jsdom
import React from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InstallBanner } from "@/components/parent/InstallBanner";
import {
  DISMISSED_AT_KEY,
  VISIT_COUNT_KEY,
} from "@/app/parent/utils/platform";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/122 Mobile Safari/537.36";
const INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Instagram 300.0.0.0";

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

function setStandalone(value: boolean | undefined) {
  Object.defineProperty(window.navigator, "standalone", {
    value,
    configurable: true,
  });
}

function mockMatchMedia(queryMatches: Record<string, boolean> = {}) {
  window.matchMedia = vi
    .fn()
    .mockImplementation((query: string) => ({
      matches: queryMatches[query] ?? false,
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })) as unknown as typeof window.matchMedia;
}

function primeVisits(count: number) {
  localStorage.setItem(VISIT_COUNT_KEY, String(count));
}

interface FireResult {
  prompt: ReturnType<typeof vi.fn>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function fireBeforeInstallPrompt(
  outcome: "accepted" | "dismissed" = "accepted",
): FireResult {
  const userChoice = Promise.resolve({ outcome });
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = new Event("beforeinstallprompt") as Event & FireResult;
  (event as unknown as FireResult).prompt = prompt;
  (event as unknown as FireResult).userChoice = userChoice;
  act(() => {
    window.dispatchEvent(event);
  });
  return { prompt, userChoice };
}

beforeEach(() => {
  localStorage.clear();
  setStandalone(undefined);
  setUserAgent(ANDROID_CHROME);
  mockMatchMedia();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("InstallBanner visibility", () => {
  it("renders nothing when already standalone", () => {
    primeVisits(10);
    mockMatchMedia({ "(display-mode: standalone)": true });
    render(<InstallBanner />);
    expect(
      screen.queryByTestId("parent-install-banner"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing inside an in-app browser (Instagram)", () => {
    primeVisits(10);
    setUserAgent(INSTAGRAM);
    render(<InstallBanner />);
    expect(
      screen.queryByTestId("parent-install-banner"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing on the first visit", () => {
    primeVisits(0);
    setUserAgent(ANDROID_CHROME);
    render(<InstallBanner />);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(
      screen.queryByTestId("parent-install-banner"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when recently dismissed", () => {
    primeVisits(10);
    localStorage.setItem(DISMISSED_AT_KEY, String(Date.now() - 1_000));
    setUserAgent(ANDROID_CHROME);
    render(<InstallBanner />);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(
      screen.queryByTestId("parent-install-banner"),
    ).not.toBeInTheDocument();
  });
});

describe("InstallBanner iOS", () => {
  it("shows the iOS hint with share instructions on Safari", () => {
    primeVisits(3);
    setUserAgent(IOS_SAFARI);
    render(<InstallBanner />);
    expect(screen.getByTestId("parent-install-banner")).toBeInTheDocument();
    expect(screen.getByTestId("install-ios-hint")).toBeInTheDocument();
    expect(screen.getByText(/Share/i)).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
  });
});

describe("InstallBanner Android", () => {
  it("shows the native install button once beforeinstallprompt fires", () => {
    primeVisits(3);
    setUserAgent(ANDROID_CHROME);
    render(<InstallBanner />);
    fireBeforeInstallPrompt();
    expect(screen.getByTestId("parent-install-banner")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /install app/i }),
    ).toBeInTheDocument();
  });

  it("falls back to manual steps when beforeinstallprompt never fires", () => {
    primeVisits(3);
    setUserAgent(ANDROID_CHROME);
    render(<InstallBanner />);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByTestId("parent-install-banner")).toBeInTheDocument();
    expect(screen.getByTestId("install-android-hint")).toBeInTheDocument();
  });

  it("calls prompt() and onInstalled when Install is clicked and accepted", async () => {
    // Real timers for this one — waitFor can't progress under fake timers
    // while we're awaiting an async prompt resolution.
    vi.useRealTimers();
    primeVisits(3);
    setUserAgent(ANDROID_CHROME);
    const onInstalled = vi.fn();
    render(<InstallBanner onInstalled={onInstalled} />);
    const { prompt } = fireBeforeInstallPrompt("accepted");

    const btn = screen.getByRole("button", { name: /install app/i });
    fireEvent.click(btn);

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onInstalled).toHaveBeenCalledTimes(1));
  });
});

describe("InstallBanner dismissal", () => {
  it("dismisses + persists timestamp when the close button is clicked", () => {
    primeVisits(3);
    setUserAgent(IOS_SAFARI);
    render(<InstallBanner />);
    const banner = screen.getByTestId("parent-install-banner");
    expect(banner).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", {
      name: /dismiss install banner/i,
    });
    fireEvent.click(closeBtn);

    expect(
      screen.queryByTestId("parent-install-banner"),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(DISMISSED_AT_KEY)).toBeTruthy();
  });
});
