// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EmailComposer } from "@/components/email/EmailComposer";

// Mock next/navigation — EmailComposer uses useRouter + useSearchParams.
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => {
    const params = new URLSearchParams();
    params.set("templateId", "tpl-1");
    return params;
  },
}));

// Silence toast side-effects — EmailComposer imports toast for its mutation
// onError override and via useFormDraft's "Draft restored" flow.
vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
}));

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function installTemplateFetchMock() {
  // Mutate updatedAt on each call to defeat React Query structural sharing,
  // guaranteeing a new data reference even though the template id is stable.
  // This mirrors what a real background refetch looks like when the server
  // returns updated metadata — the exact scenario that triggered Bug #8.
  let callCount = 0;
  global.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/api/email-templates/tpl-1")) {
      callCount += 1;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "tpl-1",
          name: "Welcome Template",
          category: "welcome",
          subject: "Welcome to Amana!",
          htmlContent: null,
          blocks: [{ type: "text", content: "Hello" }],
          isDefault: false,
          createdAt: "2026-04-20T00:00:00.000Z",
          // Different on every call → React Query treats data as changed →
          // new object reference reaches the consumer.
          updatedAt: `2026-04-20T00:00:${String(callCount).padStart(2, "0")}.000Z`,
        }),
      };
    }
    if (u.includes("/api/services")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      };
    }
    if (u.includes("/api/email/recipient-count")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ count: 0 }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
    };
  }) as unknown as typeof fetch;
}

describe("EmailComposer — subject state retention across template refetches", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    // useFormDraft persists via localStorage — clear between tests so a
    // prior draft doesn't leak into this assertion.
    try {
      window.localStorage.clear();
    } catch {
      // jsdom may not have localStorage in all environments
    }
  });

  it("preserves a user-edited subject when the template query refetches with a new reference", async () => {
    installTemplateFetchMock();

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(<EmailComposer />, { wrapper: makeWrapper(qc) });

    // Wait for the template to hydrate the subject field on first load.
    const initialInput = (await waitFor(() => {
      const el = screen.getByPlaceholderText(
        /email subject line/i,
      ) as HTMLInputElement;
      if (el.value !== "Welcome to Amana!") {
        throw new Error("subject not yet hydrated");
      }
      return el;
    })) as HTMLInputElement;

    // Simulate a user editing the subject after the template loaded.
    const edited = "Welcome to Amana! — Custom Edit";
    fireEvent.change(initialInput, { target: { value: edited } });

    expect(
      (
        screen.getByPlaceholderText(/email subject line/i) as HTMLInputElement
      ).value,
    ).toBe(edited);

    // Trigger the Bug #8 scenario: the template query refetches and returns
    // a NEW object reference (changed updatedAt defeats structural sharing)
    // with the SAME id. Before the fix, the reset effect runs again because
    // it depended on the object ref, and the user's custom edit would be
    // overwritten. After the fix, the reset effect only fires when the
    // template id changes, so the edit survives.
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["email-template", "tpl-1"] });
    });
    // Let the refetch promise and consequent React re-render flush.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const afterRefetch = screen.getByPlaceholderText(
      /email subject line/i,
    ) as HTMLInputElement;

    expect(afterRefetch.value).toBe(edited);
  });
});
