// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContractFormFields } from "@/components/contracts/ContractFormFields";

beforeEach(() => {
  global.fetch = vi.fn(async () =>
    ({
      ok: true,
      json: async () => ({
        fileName: "signed.pdf",
        fileUrl: "https://blob.vercel.com/signed-abc.pdf",
        fileSize: 1234,
        mimeType: "application/pdf",
      }),
    } as Response)
  );
});

describe("ContractFormFields upload", () => {
  it("uploads PDF to /api/upload and calls onChange with documentUrl", async () => {
    const handleChange = vi.fn();
    const file = new File(["%PDF-bytes"], "signed.pdf", { type: "application/pdf" });
    render(
      <ContractFormFields
        users={[]}
        value={{
          userId: "", contractType: "ct_permanent", awardLevel: "", awardLevelCustom: "",
          payRate: "", hoursPerWeek: "", startDate: "", endDate: "", notes: "",
          documentUrl: null, documentId: null,
        }}
        onChange={handleChange}
        disableUserSelect={false}
      />
    );
    const input = screen.getByLabelText(/signed contract pdf/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({ documentUrl: "https://blob.vercel.com/signed-abc.pdf" })
      )
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/upload",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("rejects non-PDF files with inline error (client-side)", async () => {
    const handleChange = vi.fn();
    const file = new File(["img"], "cat.png", { type: "image/png" });
    render(
      <ContractFormFields
        users={[]}
        value={{ userId: "", contractType: "ct_permanent", awardLevel: "", awardLevelCustom: "", payRate: "", hoursPerWeek: "", startDate: "", endDate: "", notes: "", documentUrl: null, documentId: null }}
        onChange={handleChange}
        disableUserSelect={false}
      />
    );
    const input = screen.getByLabelText(/signed contract pdf/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/pdf only/i)).toBeInTheDocument());
    expect(handleChange).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("surfaces server-side errors inline when upload returns 400", async () => {
    global.fetch = vi.fn(async () =>
      ({ ok: false, status: 400, json: async () => ({ error: "File content does not match declared type" }) } as Response)
    );
    const handleChange = vi.fn();
    const file = new File(["fake-pdf"], "bad.pdf", { type: "application/pdf" });
    render(
      <ContractFormFields
        users={[]}
        value={{ userId: "", contractType: "ct_permanent", awardLevel: "", awardLevelCustom: "", payRate: "", hoursPerWeek: "", startDate: "", endDate: "", notes: "", documentUrl: null, documentId: null }}
        onChange={handleChange}
        disableUserSelect={false}
      />
    );
    const input = screen.getByLabelText(/signed contract pdf/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/does not match/i)).toBeInTheDocument());
    expect(handleChange).not.toHaveBeenCalled();
  });
});
