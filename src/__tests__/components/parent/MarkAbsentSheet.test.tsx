// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarkAbsentSheet } from "@/components/parent/MarkAbsentSheet";
import type { BookingRecord } from "@/hooks/useParentPortal";

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toasts: [], dismiss: vi.fn(), toast: vi.fn() }),
}));

if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
}

const booking: BookingRecord = {
  id: "bk1",
  date: "2026-05-01T00:00:00.000Z",
  sessionType: "asc",
  status: "confirmed",
  type: "casual",
  fee: 45,
  ccsApplied: null,
  gapFee: 12,
  notes: null,
  child: { id: "c1", firstName: "Arlo", surname: "Smith" },
  service: { id: "s1", name: "Lakemba" },
  createdAt: "2026-04-20T00:00:00.000Z",
};

const TRUSTED_BLOB_URL =
  "https://abcd.public.blob.vercel-storage.com/parent-absence-certs/cert-1.pdf";

function renderSheet(overrides: Partial<Parameters<typeof MarkAbsentSheet>[0]> = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <MarkAbsentSheet booking={booking} onClose={onClose} {...overrides} />
    </QueryClientProvider>,
  );
  return { ...utils, onClose };
}

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function installFetchMock(
  opts: {
    patchStatus?: number;
    patchError?: string;
    uploadStatus?: number;
    uploadUrl?: string;
    uploadError?: string;
  } = {},
) {
  const calls: FetchCall[] = [];
  global.fetch = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });

    if (u.includes("/api/parent/upload/absence-cert")) {
      const ok = (opts.uploadStatus ?? 200) === 200;
      const payload = ok
        ? { url: opts.uploadUrl ?? TRUSTED_BLOB_URL }
        : { error: opts.uploadError ?? "Upload failed" };
      return {
        ok,
        status: opts.uploadStatus ?? 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      } as unknown as Response;
    }

    if (u.includes("/api/parent/bookings/")) {
      const ok = (opts.patchStatus ?? 200) === 200;
      const payload = ok
        ? { booking: { id: "bk1", status: "absent_notified" } }
        : { error: opts.patchError ?? "Failed" };
      return {
        ok,
        status: opts.patchStatus ?? 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      } as unknown as Response;
    }

    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
      text: async () => "{}",
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return calls;
}

describe("MarkAbsentSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the sheet in closed state when booking is null", () => {
    renderSheet({ booking: null });
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog.className).toMatch(/translate-y-full/);
    expect(screen.queryByText(/session/i)).toBeNull();
  });

  it("renders title, illness toggle (off by default), notes + attach button", () => {
    installFetchMock();
    renderSheet();
    expect(screen.getAllByText(/mark as absent/i).length).toBeGreaterThan(0);
    const toggle = screen.getByRole("switch", { name: /due to illness/i });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /attach certificate/i })).toBeInTheDocument();
  });

  it("clamps notes at the 500-char limit and shows the counter", () => {
    installFetchMock();
    renderSheet();
    const textarea = screen.getByLabelText(/notes/i) as HTMLTextAreaElement;
    const long = "x".repeat(600);
    fireEvent.change(textarea, { target: { value: long } });
    expect(textarea.value.length).toBe(500);
    expect(screen.getByText("500/500")).toBeInTheDocument();
  });

  it("submit fires mutation with isIllness=true and trimmed notes when toggle is on", async () => {
    const calls = installFetchMock();
    const { onClose } = renderSheet();

    fireEvent.click(screen.getByRole("switch", { name: /due to illness/i }));
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: "  Fever since last night  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /^submit absence$/i }));

    await waitFor(() => {
      const patch = calls.find(
        (c) => c.url.includes("/api/parent/bookings/bk1") && c.init?.method === "PATCH",
      );
      expect(patch).toBeDefined();
    });

    const patch = calls.find(
      (c) => c.url.includes("/api/parent/bookings/bk1") && c.init?.method === "PATCH",
    )!;
    const body = JSON.parse(String(patch.init!.body));
    expect(body.isIllness).toBe(true);
    expect(body.notes).toBe("Fever since last night");
    expect(body.medicalCertificateUrl).toBeUndefined();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("omits notes from payload when the textarea is blank", async () => {
    const calls = installFetchMock();
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /^submit absence$/i }));

    await waitFor(() => {
      const patch = calls.find(
        (c) => c.url.includes("/api/parent/bookings/bk1") && c.init?.method === "PATCH",
      );
      expect(patch).toBeDefined();
    });

    const patch = calls.find(
      (c) => c.url.includes("/api/parent/bookings/bk1") && c.init?.method === "PATCH",
    )!;
    const body = JSON.parse(String(patch.init!.body));
    expect(body.notes).toBeUndefined();
    expect(body.isIllness).toBe(false);
  });

  it("uploads a cert, shows the filename, and includes the URL in the payload", async () => {
    const calls = installFetchMock();
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /attach certificate/i }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["pdf bytes"], "cert.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("cert.pdf")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^submit absence$/i }));

    await waitFor(() => {
      const patch = calls.find(
        (c) => c.url.includes("/api/parent/bookings/bk1") && c.init?.method === "PATCH",
      );
      expect(patch).toBeDefined();
    });
    const patch = calls.find(
      (c) => c.url.includes("/api/parent/bookings/bk1") && c.init?.method === "PATCH",
    )!;
    const body = JSON.parse(String(patch.init!.body));
    expect(body.medicalCertificateUrl).toBe(TRUSTED_BLOB_URL);
  });

  it("remove-cert button clears the URL and shows the attach button again", async () => {
    installFetchMock();
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /attach certificate/i }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["pdf"], "cert.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => {
      expect(screen.getByText("cert.pdf")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /remove certificate/i }));

    expect(screen.queryByText("cert.pdf")).toBeNull();
    expect(screen.getByRole("button", { name: /attach certificate/i })).toBeInTheDocument();
  });

  it("shows a destructive toast and stays open when the upload fails", async () => {
    installFetchMock({ uploadStatus: 400, uploadError: "File too large" });
    const { onClose } = renderSheet();
    const { toast } = await import("@/hooks/useToast");

    fireEvent.click(screen.getByRole("button", { name: /attach certificate/i }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["pdf"], "cert.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => {
      const calls = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.find((c) => (c[0] as { variant?: string }).variant === "destructive"),
      ).toBeDefined();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /attach certificate/i })).toBeInTheDocument();
  });

  it("disables submit while the mutation is pending", async () => {
    let resolvePatch: ((value: Response) => void) | undefined;
    global.fetch = vi.fn().mockImplementation(
      async (url: string | URL) =>
        new Promise<Response>((resolve) => {
          if (String(url).includes("/api/parent/bookings/")) {
            resolvePatch = resolve;
          } else {
            resolve({
              ok: true,
              status: 200,
              headers: new Headers({ "content-type": "application/json" }),
              json: async () => ({}),
              text: async () => "{}",
            } as unknown as Response);
          }
        }),
    ) as unknown as typeof fetch;

    renderSheet();
    const submit = screen.getByRole("button", { name: /^submit absence$/i });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /submitting/i })).toBeDisabled();
    });

    resolvePatch?.({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ booking: { id: "bk1" } }),
      text: async () => "{}",
    } as unknown as Response);
  });
});
