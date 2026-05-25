// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// DataEntryCell's mutation isn't relevant to layout tests, but it imports
// useCreateEntry which calls into fetch-api. Stub it so the cells mount.
vi.mock("@/hooks/useScorecard", async (orig) => {
  const actual = await orig<typeof import("@/hooks/useScorecard")>();
  return {
    ...actual,
    useCreateEntry: () => ({
      mutate: () => undefined,
      mutateAsync: async () => undefined,
    }),
  };
});

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
  mutateApi: vi.fn(),
}));

import { ScorecardGrid } from "@/components/scorecard/ScorecardGrid";
import type { ScorecardData } from "@/hooks/useScorecard";

function buildOwner(id: string, name: string) {
  return { id, name, email: `${id}@example.com`, avatar: null };
}

function buildMeasurable(
  overrides: Partial<ScorecardData["measurables"][number]>,
): ScorecardData["measurables"][number] {
  return {
    id: "m-x",
    title: "Untitled",
    description: null,
    ownerId: "u-1",
    owner: buildOwner("u-1", "Sarah Johnson"),
    goalValue: 10,
    goalDirection: "above",
    unit: null,
    frequency: "weekly",
    rockId: null,
    rock: null,
    serviceId: null,
    service: null,
    entries: [],
    ...overrides,
  };
}

function renderGrid(
  scorecard: ScorecardData,
  groupBy: "person" | "service" = "person",
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ScorecardGrid scorecard={scorecard} groupBy={groupBy} />
    </QueryClientProvider>,
  );
}

describe("ScorecardGrid — layout restructure", () => {
  const scorecard: ScorecardData = {
    id: "sc-1",
    title: "Leadership Scorecard",
    measurables: [
      buildMeasurable({
        id: "m-1",
        title: "Customer Satisfaction",
        ownerId: "u-1",
        owner: buildOwner("u-1", "Sarah Johnson"),
        service: { id: "svc-1", name: "Mawson Lakes" },
        serviceId: "svc-1",
      }),
      buildMeasurable({
        id: "m-2",
        title: "Revenue",
        ownerId: "u-2",
        owner: buildOwner("u-2", "Daniel Chen"),
        service: { id: "svc-1", name: "Mawson Lakes" },
        serviceId: "svc-1",
      }),
      buildMeasurable({
        id: "m-3",
        title: "Staff Retention",
        ownerId: "u-1",
        owner: buildOwner("u-1", "Sarah Johnson"),
        service: { id: "svc-2", name: "Pooraka" },
        serviceId: "svc-2",
      }),
    ],
  };

  it("renders an Owner column header positioned between Goal and 13wk Avg", () => {
    const { container } = renderGrid(scorecard);
    const headerCells = Array.from(
      container.querySelectorAll("thead th"),
    ).map((th) => (th.textContent || "").trim());
    const goalIdx = headerCells.findIndex((t) => t.startsWith("Goal"));
    const ownerIdx = headerCells.findIndex((t) => t === "Owner");
    const avgIdx = headerCells.findIndex((t) => t.includes("13wk Avg"));
    expect(goalIdx).toBeGreaterThanOrEqual(0);
    expect(ownerIdx).toBe(goalIdx + 1);
    expect(avgIdx).toBe(ownerIdx + 1);
  });

  it("renders each measurable's owner name inline in the Owner cell", () => {
    renderGrid(scorecard);
    // Each owner name appears once per measurable they own. Sarah owns
    // m-1 and m-3 → 2 occurrences. Daniel owns m-2 → 1.
    expect(screen.getAllByText("Sarah Johnson")).toHaveLength(2);
    expect(screen.getAllByText("Daniel Chen")).toHaveLength(1);
  });

  it("does NOT render owner divider rows in person mode (rows are flat)", () => {
    const { container } = renderGrid(scorecard, "person");
    // Divider rows have a single <td> with colspan; data rows have
    // many <td>s. Count tbody rows that are NOT divider rows.
    const allRows = container.querySelectorAll("tbody > tr");
    const dividerRows = Array.from(allRows).filter(
      (tr) => tr.querySelectorAll("td").length === 1,
    );
    expect(dividerRows).toHaveLength(0);
    // One row per measurable — three measurables → three rows.
    expect(allRows.length).toBe(3);
  });

  it("renders service divider rows in service mode (service grouping preserved)", () => {
    const { container } = renderGrid(scorecard, "service");
    const dividerRows = Array.from(
      container.querySelectorAll("tbody > tr"),
    ).filter((tr) => tr.querySelectorAll("td").length === 1);
    // Two services → two divider rows.
    expect(dividerRows).toHaveLength(2);
    const labels = dividerRows.map((tr) => tr.textContent?.trim());
    expect(labels).toContain("Mawson Lakes");
    expect(labels).toContain("Pooraka");
  });

  it("falls back to 'Unassigned' for measurables without an owner", () => {
    const orphan: ScorecardData = {
      ...scorecard,
      measurables: [
        buildMeasurable({
          id: "m-orphan",
          title: "Mystery",
          ownerId: "",
          owner: null as unknown as ScorecardData["measurables"][number]["owner"],
        }),
      ],
    };
    renderGrid(orphan);
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("uses initials when the owner has no avatar", () => {
    const { container } = renderGrid(scorecard);
    // Sarah Johnson → "SJ"; Daniel Chen → "DC". Both appear at least
    // once.
    const initialsTexts = Array.from(
      container.querySelectorAll("span"),
    ).map((s) => s.textContent || "");
    expect(initialsTexts).toContain("SJ");
    expect(initialsTexts).toContain("DC");
  });

  it("renders an avatar img instead of initials when avatar URL is present", () => {
    const withAvatar: ScorecardData = {
      ...scorecard,
      measurables: [
        buildMeasurable({
          id: "m-avatar",
          owner: {
            id: "u-9",
            name: "Mirna",
            email: "mirna@example.com",
            avatar: "https://example.com/mirna.jpg",
          },
        }),
      ],
    };
    const { container } = renderGrid(withAvatar);
    const img = container.querySelector("img[src='https://example.com/mirna.jpg']");
    expect(img).not.toBeNull();
  });
});

describe("ScorecardGrid — column count integrity", () => {
  it("data rows have the same number of cells as the header (no shift after Owner insertion)", () => {
    const scorecard: ScorecardData = {
      id: "sc-1",
      title: "Scorecard",
      measurables: [
        buildMeasurable({ id: "m-1", title: "M1" }),
      ],
    };
    const { container } = renderGrid(scorecard);
    const headerCellCount =
      container.querySelectorAll("thead th").length;
    const dataRow = container.querySelector("tbody > tr");
    const dataCellCount = dataRow?.querySelectorAll("td").length ?? 0;
    expect(dataCellCount).toBe(headerCellCount);
  });
});
