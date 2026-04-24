// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useParentPosts", () => ({
  useCreateParentPost: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateParentPost: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useChildren", () => ({
  useChildren: () => ({ data: { children: [] } }),
}));
vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
}));

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { CreateParentPostForm } from "@/components/services/CreateParentPostForm";

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CreateParentPostForm serviceId="svc-1" open onClose={() => {}} />
    </QueryClientProvider>,
  );
}

function makeImage(sizeBytes: number, name = "x.jpg", type = "image/jpeg"): File {
  return new File([new Uint8Array(sizeBytes) as BlobPart], name, { type });
}

function uploadOk() {
  fetchMock.mockImplementation(async () => ({
    ok: true,
    json: async () => ({
      url: `https://abc.public.blob.vercel-storage.com/x-${Math.random()}.jpg`,
    }),
    headers: new Headers({ "content-type": "application/json" }),
  }));
}

describe("CreateParentPostForm image upload", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("rejects files over 5MB on the client (no network call)", async () => {
    renderForm();
    const fileInput = screen.getByLabelText(/add photos/i) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [makeImage(5 * 1024 * 1024 + 1)] },
    });
    await waitFor(() =>
      expect(screen.getByText(/too large/i)).toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads and shows a thumbnail for each picked file (up to 6)", async () => {
    uploadOk();
    renderForm();
    const fileInput = screen.getByLabelText(/add photos/i) as HTMLInputElement;
    const files = Array.from({ length: 3 }, (_, i) => makeImage(1024, `a${i}.jpg`));
    fireEvent.change(fileInput, { target: { files } });
    await waitFor(() =>
      expect(
        screen.getAllByRole("img", { name: /uploaded photo/i }),
      ).toHaveLength(3),
    );
  });

  it("uploads at most 6 when more are picked and surfaces an error for the overflow", async () => {
    uploadOk();
    renderForm();
    const fileInput = screen.getByLabelText(/add photos/i) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: Array.from({ length: 7 }, (_, i) => makeImage(1024, `a${i}.jpg`)),
      },
    });
    await waitFor(() =>
      expect(
        screen.getAllByRole("img", { name: /uploaded photo/i }),
      ).toHaveLength(6),
    );
    expect(screen.getByText(/maximum.*6/i)).toBeInTheDocument();
  });

  it("hides the '+' picker once 6 photos are queued", async () => {
    uploadOk();
    renderForm();
    const fileInput = screen.getByLabelText(/add photos/i) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: Array.from({ length: 6 }, (_, i) => makeImage(1024, `a${i}.jpg`)),
      },
    });
    await waitFor(() =>
      expect(
        screen.getAllByRole("img", { name: /uploaded photo/i }),
      ).toHaveLength(6),
    );
    expect(screen.queryByLabelText(/add photos/i)).toBeNull();
  });

  it("removes a thumbnail when its X is clicked", async () => {
    uploadOk();
    renderForm();
    const fileInput = screen.getByLabelText(/add photos/i) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [makeImage(1024, "a.jpg"), makeImage(1024, "b.jpg")],
      },
    });
    await waitFor(() =>
      expect(
        screen.getAllByRole("img", { name: /uploaded photo/i }),
      ).toHaveLength(2),
    );
    fireEvent.click(screen.getAllByRole("button", { name: /remove photo/i })[0]);
    await waitFor(() =>
      expect(
        screen.getAllByRole("img", { name: /uploaded photo/i }),
      ).toHaveLength(1),
    );
  });

  it("shows an error when the upload endpoint returns non-ok", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      json: async () => ({ error: "File type not allowed" }),
      headers: new Headers({ "content-type": "application/json" }),
    }));
    renderForm();
    const fileInput = screen.getByLabelText(/add photos/i) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeImage(1024)] } });
    await waitFor(() =>
      expect(screen.getByText(/file type not allowed/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryAllByRole("img", { name: /uploaded photo/i }),
    ).toHaveLength(0);
  });
});
