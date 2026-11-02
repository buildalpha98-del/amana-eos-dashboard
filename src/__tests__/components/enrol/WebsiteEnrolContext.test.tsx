// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { WebsiteEnrolContext } from "@/components/enrol/WebsiteEnrolContext";
import { WEBSITE_CONTEXT_KEY } from "@/lib/website-enrol-context";

const go = (search: string) => window.history.replaceState(null, "", `/parent/signup${search}`);
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
});

describe("WebsiteEnrolContext", () => {
  it("a centre on its own shows nothing (the school is chosen in the form)", async () => {
    go("?centre=mfis-greenacre");
    const { container } = render(<WebsiteEnrolContext entry />);
    await new Promise((r) => setTimeout(r, 10));
    expect(container.textContent).toBe("");
  });

  it("sign-up clears a centre left over from an earlier page visit", async () => {
    store.set(WEBSITE_CONTEXT_KEY, "centre=mfis-greenacre&program=al-hafiz");
    go("");
    render(<WebsiteEnrolContext entry />);
    await waitFor(() => expect(store.has(WEBSITE_CONTEXT_KEY)).toBe(false));
  });

  it("the Al Hafiz link explains itself, and the form still sees it after sign-up", async () => {
    go("?centre=mfis-greenacre&program=al-hafiz");
    render(<WebsiteEnrolContext entry />);
    expect(await screen.findByText("Enrolling for Al Hafiz program at MFIS Greenacre")).toBeInTheDocument();
    go("");
    render(<WebsiteEnrolContext />);
    await waitFor(() => expect(screen.getAllByText(/Al Hafiz program/)).toHaveLength(2));
  });
});
