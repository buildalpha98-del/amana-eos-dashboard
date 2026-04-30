// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";

// Silence toast side-effects — CreateProjectModal imports toast via
// useCreateProject for its mutation onError handler.
vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function installFetchMock() {
  global.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/api/project-templates")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [
          {
            id: "tpl-centre-launch",
            name: "Centre Launch",
            description: "Full launch checklist",
            category: "Operations",
            tasks: [
              {
                id: "task-1",
                title: "Set up CCS",
                description: null,
                category: "Compliance",
                sortOrder: 0,
                defaultDays: 7,
              },
              {
                id: "task-2",
                title: "Hire staff",
                description: null,
                category: "People",
                sortOrder: 1,
                defaultDays: 14,
              },
            ],
            _count: { projects: 3 },
            createdAt: "2026-04-20T00:00:00.000Z",
          },
          {
            id: "tpl-audit",
            name: "Annual Audit",
            description: "Audit checklist",
            category: "Compliance",
            tasks: [
              {
                id: "task-3",
                title: "Collect records",
                description: null,
                category: "Compliance",
                sortOrder: 0,
                defaultDays: 3,
              },
            ],
            _count: { projects: 0 },
            createdAt: "2026-04-20T00:00:00.000Z",
          },
        ],
      } as unknown as Response;
    }
    if (u.includes("/api/services")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as unknown as Response;
    }
    if (u.includes("/api/users")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => [],
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("CreateProjectModal — open without freezing (bug-10)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    installFetchMock();
    // Capture React's dev warnings — setState-during-render produces a
    // console.error, which is the fingerprint of the original bug.
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("renders when opened without a preselected template (New Project button)", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = makeWrapper(qc);

    render(
      <Wrapper>
        <CreateProjectModal open onClose={() => {}} />
      </Wrapper>,
    );

    // Modal header renders for "Create New Project"
    expect(
      await screen.findByRole("heading", { name: /Create New Project/i }),
    ).toBeDefined();

    // Form fields render
    expect(screen.getByPlaceholderText(/Lakemba Centre Opening/i)).toBeDefined();
  });

  it("auto-fills template data when opened with preselectedTemplateId (Launch from Template)", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = makeWrapper(qc);

    render(
      <Wrapper>
        <CreateProjectModal
          open
          onClose={() => {}}
          preselectedTemplateId="tpl-centre-launch"
        />
      </Wrapper>,
    );

    // Header shows the "Launch from Template" variant
    expect(
      await screen.findByRole("heading", { name: /Launch from Template/i }),
    ).toBeDefined();

    // Auto-select effect must populate the name input with the template name
    await waitFor(
      () => {
        const nameInput = screen.getByPlaceholderText(
          /Lakemba Centre Opening/i,
        ) as HTMLInputElement;
        expect(nameInput.value).toBe("Centre Launch");
      },
      { timeout: 2000 },
    );
  });

  it("does not emit React setState-during-render warnings (bug-10 fingerprint)", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = makeWrapper(qc);

    await act(async () => {
      render(
        <Wrapper>
          <CreateProjectModal
            open
            onClose={() => {}}
            preselectedTemplateId="tpl-centre-launch"
          />
        </Wrapper>,
      );
    });

    // Wait for templates query to resolve and auto-fill to run
    await waitFor(() => {
      const nameInput = screen.getByPlaceholderText(
        /Lakemba Centre Opening/i,
      ) as HTMLInputElement;
      expect(nameInput.value).toBe("Centre Launch");
    });

    // None of the usual setState-during-render / update-depth warnings
    // should have fired. Before the fix, setState was called directly in
    // the render body while templates were loading, which React 19 reports
    // via one of these messages.
    const badCalls = errorSpy.mock.calls.filter((args: unknown[]) => {
      const msg = args.map((a: unknown) => String(a)).join(" ");
      return (
        msg.includes("Cannot update a component while rendering") ||
        msg.includes("Too many re-renders") ||
        msg.includes("Maximum update depth exceeded")
      );
    });
    expect(badCalls).toHaveLength(0);
  });

  it("re-opening with a different preselectedTemplateId re-fills the form", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = makeWrapper(qc);

    const { rerender } = render(
      <Wrapper>
        <CreateProjectModal
          open
          onClose={() => {}}
          preselectedTemplateId="tpl-centre-launch"
        />
      </Wrapper>,
    );

    // First open: Centre Launch fills in
    await waitFor(() => {
      const nameInput = screen.getByPlaceholderText(
        /Lakemba Centre Opening/i,
      ) as HTMLInputElement;
      expect(nameInput.value).toBe("Centre Launch");
    });

    // Close the modal (simulating user dismiss)
    rerender(
      <Wrapper>
        <CreateProjectModal
          open={false}
          onClose={() => {}}
          preselectedTemplateId={undefined}
        />
      </Wrapper>,
    );

    // Reopen with a DIFFERENT template — without the fix, the stale
    // "did auto-select" guard would block refilling the form.
    rerender(
      <Wrapper>
        <CreateProjectModal
          open
          onClose={() => {}}
          preselectedTemplateId="tpl-audit"
        />
      </Wrapper>,
    );

    await waitFor(
      () => {
        const nameInput = screen.getByPlaceholderText(
          /Lakemba Centre Opening/i,
        ) as HTMLInputElement;
        expect(nameInput.value).toBe("Annual Audit");
      },
      { timeout: 2000 },
    );
  });
});
