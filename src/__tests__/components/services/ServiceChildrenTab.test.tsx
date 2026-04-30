// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Mocks ───────────────────────────────────────────────────────

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "user-self",
        email: "me@example.com",
        role: "admin",
        serviceId: null,
      },
    },
    status: "authenticated",
  }),
}));

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

// Capture the last filter object passed to useChildren so we can assert on
// it from the test.
const lastFiltersRef: { value: unknown } = { value: null };
const useChildrenMock = vi.fn();

vi.mock("@/hooks/useChildren", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useChildren")>(
    "@/hooks/useChildren",
  );
  return {
    ...actual,
    useChildren: (filters: unknown) => {
      lastFiltersRef.value = filters;
      return useChildrenMock(filters);
    },
  };
});

// next/navigation mocks so any internal navigation doesn't crash.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/services/svc-1",
}));

import { ServiceChildrenTab } from "@/components/services/ServiceChildrenTab";

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
}

function makeChild(overrides: Record<string, unknown> = {}) {
  return {
    id: "child-1",
    enrolmentId: "enr-1",
    serviceId: "svc-1",
    firstName: "Alice",
    surname: "Smith",
    dob: "2020-03-01",
    gender: null,
    address: null,
    culturalBackground: [],
    schoolName: "Alpha Primary",
    yearLevel: "Year 1",
    crn: null,
    medical: null,
    dietary: null,
    bookingPrefs: null,
    medicalConditions: [],
    medicationDetails: null,
    anaphylaxisActionPlan: false,
    dietaryRequirements: [],
    additionalNeeds: null,
    photo: null,
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    service: { id: "svc-1", name: "Alpha", code: "A" },
    enrolment: {
      id: "enr-1",
      primaryParent: {
        firstName: "Priya",
        surname: "Smith",
        email: "priya@example.com",
        mobile: "+61400000001",
      },
      status: "submitted",
      createdAt: "2026-01-01T00:00:00Z",
    },
    parents: [
      {
        firstName: "Priya",
        surname: "Smith",
        relationship: "Mother",
        isPrimary: true,
        email: "priya@example.com",
        phone: "+61400000001",
      },
      {
        firstName: "Sam",
        surname: "Smith",
        relationship: "Father",
        isPrimary: false,
        email: "sam@example.com",
        phone: "+61400000002",
      },
    ],
    ...overrides,
  };
}

describe("ServiceChildrenTab — filters + parents + links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastFiltersRef.value = null;
    useChildrenMock.mockReturnValue({
      data: { children: [makeChild()], total: 1 },
      isLoading: false,
      error: null,
    });
  });

  it("initialises with serviceId + status=current + includeParents=true", () => {
    const qc = makeClient();
    render(<ServiceChildrenTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    const filters = lastFiltersRef.value as Record<string, unknown>;
    expect(filters.serviceId).toBe("svc-1");
    expect(filters.status).toBe("current");
    expect(filters.includeParents).toBe(true);
  });

  it("renders child name as a link to /children/[id]", () => {
    const qc = makeClient();
    render(<ServiceChildrenTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    const link = screen.getByRole("link", { name: /Alice Smith/ });
    expect(link.getAttribute("href")).toBe("/children/child-1");
  });

  it("renders parents list with primary starred and click-to-action links", () => {
    const qc = makeClient();
    render(<ServiceChildrenTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    // Primary star — aria-label on the icon
    const primaryStar = screen.getByLabelText(/primary contact/i);
    expect(primaryStar).toBeDefined();

    // mailto link on primary parent
    const emailLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")?.startsWith("mailto:"));
    expect(emailLinks.some((a) => a.getAttribute("href") === "mailto:priya@example.com")).toBe(true);
    expect(emailLinks.some((a) => a.getAttribute("href") === "mailto:sam@example.com")).toBe(true);

    // tel link on primary parent
    const telLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")?.startsWith("tel:"));
    expect(telLinks.some((a) => a.getAttribute("href") === "tel:+61400000001")).toBe(true);
  });

  it("renders CCS badge when ccsStatus is present", () => {
    useChildrenMock.mockReturnValue({
      data: {
        children: [makeChild({ ccsStatus: "eligible" })],
        total: 1,
      },
      isLoading: false,
      error: null,
    });

    const qc = makeClient();
    render(<ServiceChildrenTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    expect(screen.getByTestId("ccs-badge")).toBeDefined();
  });

  it("hides CCS badge when ccsStatus is absent", () => {
    // default makeChild() has no ccsStatus
    const qc = makeClient();
    render(<ServiceChildrenTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    expect(screen.queryByTestId("ccs-badge")).toBeNull();
  });

  it("changing status filter triggers a new useChildren call with new status", () => {
    const qc = makeClient();
    render(<ServiceChildrenTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    // click the Withdrawn radio
    fireEvent.click(screen.getByRole("radio", { name: /withdrawn/i }));

    const filters = lastFiltersRef.value as Record<string, unknown>;
    expect(filters.status).toBe("withdrawn");
    // serviceId still preserved
    expect(filters.serviceId).toBe("svc-1");
    expect(filters.includeParents).toBe(true);
  });
});
