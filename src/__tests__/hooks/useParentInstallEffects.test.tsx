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
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  VISIT_COUNT_KEY,
  getVisitCount,
} from "@/app/parent/utils/platform";
import { useParentInstallEffects } from "@/hooks/useParentInstallEffects";

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
}));

const fetchMock = vi.fn();

function installFetchMock(onboardingInstalled: boolean) {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/parent/onboarding")) {
        if (init?.method === "PATCH") {
          return new Response(
            JSON.stringify({
              progress: {
                profile: true,
                medical: true,
                documents: true,
                pickups: true,
                installed: true,
              },
              completedCount: 5,
              totalCount: 5,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            progress: {
              profile: false,
              medical: false,
              documents: false,
              pickups: false,
              installed: onboardingInstalled,
            },
            completedCount: onboardingInstalled ? 1 : 0,
            totalCount: 5,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

function mockStandalone(standalone: boolean) {
  Object.defineProperty(window.navigator, "standalone", {
    value: standalone,
    configurable: true,
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query.includes("standalone"),
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  })) as unknown as typeof window.matchMedia;
}

function renderHook(enabled: boolean) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Harness() {
    useParentInstallEffects(enabled);
    return <div data-testid="ok" />;
  }

  return render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mockStandalone(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useParentInstallEffects", () => {
  it("does not bump visits or PATCH when disabled", async () => {
    installFetchMock(false);
    renderHook(false);
    // Let the onboarding GET settle — it still runs because hooks must be
    // called unconditionally, but the effects keyed on `enabled` must not.
    await act(async () => {
      await Promise.resolve();
    });
    expect(getVisitCount()).toBe(0);
    const hasPatch = fetchMock.mock.calls.some(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
    );
    expect(hasPatch).toBe(false);
  });

  it("increments the visit counter exactly once per mount", async () => {
    installFetchMock(false);
    const { rerender } = renderHook(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(localStorage.getItem(VISIT_COUNT_KEY)).toBe("1");

    // Force a rerender — the ref guard should prevent a second increment.
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <div />
      </QueryClientProvider>,
    );
    expect(localStorage.getItem(VISIT_COUNT_KEY)).toBe("1");
  });

  it("PATCHes onboarding installed=true when standalone and not yet installed", async () => {
    mockStandalone(true);
    installFetchMock(false);
    renderHook(true);

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patchCall).toBeTruthy();
    });

    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
    );
    const [, init] = patchCall!;
    const body = JSON.parse(
      (init as RequestInit).body as string,
    ) as { installed: boolean };
    expect(body.installed).toBe(true);
  });

  it("does not PATCH when onboarding already shows installed=true", async () => {
    mockStandalone(true);
    installFetchMock(true);
    renderHook(true);

    // Let the GET resolve.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });

    const hasPatch = fetchMock.mock.calls.some(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
    );
    expect(hasPatch).toBe(false);
  });

  it("does not PATCH when the app is not running standalone", async () => {
    mockStandalone(false);
    installFetchMock(false);
    renderHook(true);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });

    const hasPatch = fetchMock.mock.calls.some(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
    );
    expect(hasPatch).toBe(false);
  });
});
