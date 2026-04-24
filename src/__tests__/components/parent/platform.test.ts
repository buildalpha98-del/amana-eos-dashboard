// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISMISSED_AT_KEY,
  DISMISS_WINDOW_MS,
  VISIT_COUNT_KEY,
  clearDismissedAt,
  getDismissedAt,
  getVisitCount,
  incrementVisitCount,
  isIOS,
  isInAppBrowser,
  isRecentlyDismissed,
  isStandalone,
  setDismissedAt,
} from "@/app/parent/utils/platform";

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

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  setStandalone(undefined);
  setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
  mockMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isStandalone", () => {
  it("returns true when display-mode is standalone", () => {
    mockMatchMedia(true);
    expect(isStandalone()).toBe(true);
  });

  it("returns true when navigator.standalone is true (iOS)", () => {
    mockMatchMedia(false);
    setStandalone(true);
    expect(isStandalone()).toBe(true);
  });

  it("returns false otherwise", () => {
    mockMatchMedia(false);
    setStandalone(false);
    expect(isStandalone()).toBe(false);
  });

  it("does not throw when matchMedia throws", () => {
    window.matchMedia = vi.fn(() => {
      throw new Error("boom");
    }) as unknown as typeof window.matchMedia;
    setStandalone(false);
    expect(() => isStandalone()).not.toThrow();
    expect(isStandalone()).toBe(false);
  });
});

describe("isIOS", () => {
  it("detects iPhone UA", () => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    );
    expect(isIOS()).toBe(true);
  });

  it("detects iPad UA", () => {
    setUserAgent(
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    );
    expect(isIOS()).toBe(true);
  });

  it("detects iPadOS 13+ masquerading as Mac", () => {
    setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    Object.defineProperty(window.navigator, "maxTouchPoints", {
      value: 5,
      configurable: true,
    });
    expect(isIOS()).toBe(true);
  });

  it("returns false on Android", () => {
    setUserAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/122",
    );
    expect(isIOS()).toBe(false);
  });

  it("returns false on desktop Mac with no touch", () => {
    setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    Object.defineProperty(window.navigator, "maxTouchPoints", {
      value: 0,
      configurable: true,
    });
    expect(isIOS()).toBe(false);
  });
});

describe("isInAppBrowser", () => {
  const cases: Array<[string, string]> = [
    ["Instagram", "Mozilla/5.0 ... Instagram 300.0.0.0"],
    ["Facebook", "Mozilla/5.0 ... FBAN/FBIOS;FBAV/450.0"],
    ["Line", "Mozilla/5.0 ... Line/12.0.1"],
    ["WeChat", "Mozilla/5.0 ... MicroMessenger/8.0"],
    ["TikTok", "Mozilla/5.0 ... BytedanceWebview"],
  ];
  for (const [name, ua] of cases) {
    it(`flags ${name} webview`, () => {
      setUserAgent(ua);
      expect(isInAppBrowser()).toBe(true);
    });
  }

  it("returns false for Safari", () => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
    );
    expect(isInAppBrowser()).toBe(false);
  });

  it("returns false for Chrome Android", () => {
    setUserAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/122 Mobile Safari/537.36",
    );
    expect(isInAppBrowser()).toBe(false);
  });
});

describe("visit count", () => {
  it("starts at 0 when nothing is stored", () => {
    expect(getVisitCount()).toBe(0);
  });

  it("increments each call", () => {
    expect(incrementVisitCount()).toBe(1);
    expect(incrementVisitCount()).toBe(2);
    expect(incrementVisitCount()).toBe(3);
    expect(getVisitCount()).toBe(3);
    expect(localStorage.getItem(VISIT_COUNT_KEY)).toBe("3");
  });

  it("recovers from non-numeric values in storage", () => {
    localStorage.setItem(VISIT_COUNT_KEY, "not-a-number");
    expect(getVisitCount()).toBe(0);
    expect(incrementVisitCount()).toBe(1);
  });

  it("recovers from negative values in storage", () => {
    localStorage.setItem(VISIT_COUNT_KEY, "-5");
    expect(getVisitCount()).toBe(0);
  });
});

describe("dismissed timestamp", () => {
  it("returns null when nothing is stored", () => {
    expect(getDismissedAt()).toBeNull();
    expect(isRecentlyDismissed()).toBe(false);
  });

  it("round-trips setDismissedAt / getDismissedAt", () => {
    setDismissedAt(1_700_000_000_000);
    expect(getDismissedAt()).toBe(1_700_000_000_000);
    expect(localStorage.getItem(DISMISSED_AT_KEY)).toBe("1700000000000");
  });

  it("clearDismissedAt removes the entry", () => {
    setDismissedAt(1_700_000_000_000);
    clearDismissedAt();
    expect(getDismissedAt()).toBeNull();
    expect(isRecentlyDismissed()).toBe(false);
  });

  it("isRecentlyDismissed respects the 30-day window", () => {
    const now = 1_700_000_000_000;
    const freshlyDismissed = now - 1_000;
    const oldDismissed = now - DISMISS_WINDOW_MS - 1_000;

    setDismissedAt(freshlyDismissed);
    expect(isRecentlyDismissed(now)).toBe(true);

    setDismissedAt(oldDismissed);
    expect(isRecentlyDismissed(now)).toBe(false);
  });
});

describe("DISMISS_WINDOW_MS", () => {
  it("is 30 days", () => {
    expect(DISMISS_WINDOW_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
