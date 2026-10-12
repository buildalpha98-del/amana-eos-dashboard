// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EmailHtmlEditor, { MAX_HTML_UPLOAD_BYTES } from "@/components/email/EmailHtmlEditor";
import { toast } from "@/hooks/useToast";

vi.mock("@/hooks/useToast", () => ({ toast: vi.fn() }));

function pick(file: File) {
  fireEvent.change(screen.getByTestId("html-file-input"), { target: { files: [file] } });
}

describe("EmailHtmlEditor upload", () => {
  beforeEach(() => {
    vi.mocked(toast).mockClear();
  });

  it("loads an .html file into the editor", async () => {
    const onChange = vi.fn();
    render(<EmailHtmlEditor value="" onChange={onChange} />);
    pick(new File(["<h1>Hello</h1>"], "newsletter.html", { type: "text/html" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("<h1>Hello</h1>"));
  });

  it("rejects non-HTML files", async () => {
    const onChange = vi.fn();
    render(<EmailHtmlEditor value="" onChange={onChange} />);
    pick(new File(["hi"], "notes.txt", { type: "text/plain" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects files over the size cap", async () => {
    const onChange = vi.fn();
    render(<EmailHtmlEditor value="" onChange={onChange} />);
    pick(new File(["x".repeat(MAX_HTML_UPLOAD_BYTES + 1)], "big.html", { type: "text/html" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("asks before replacing existing HTML and respects a cancel", async () => {
    const onChange = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<EmailHtmlEditor value="<p>existing</p>" onChange={onChange} />);
    pick(new File(["<h1>New</h1>"], "new.html", { type: "text/html" }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
