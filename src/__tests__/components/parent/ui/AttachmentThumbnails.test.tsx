// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttachmentThumbnails } from "@/components/parent/ui/AttachmentThumbnails";
import type { MessageAttachment } from "@/components/parent/ui/useMessageAttachments";

if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => {};
}

function makeAttachment(
  overrides: Partial<MessageAttachment> = {},
): MessageAttachment {
  const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
  return {
    id: "att-1",
    previewUrl: "blob:preview-1",
    file,
    status: "done",
    url: "https://abcd.public.blob.vercel-storage.com/message-attachments/img.jpg",
    ...overrides,
  };
}

describe("AttachmentThumbnails", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(
      <AttachmentThumbnails attachments={[]} onRemove={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a loading overlay when an attachment is uploading", () => {
    const att = makeAttachment({ status: "uploading", url: undefined });
    render(<AttachmentThumbnails attachments={[att]} onRemove={() => {}} />);
    const status = screen.getByRole("status", { name: /uploading/i });
    expect(status).toBeTruthy();
  });

  it("renders a failure overlay when an upload failed", () => {
    const att = makeAttachment({
      status: "failed",
      url: undefined,
      error: "Upload failed",
    });
    render(<AttachmentThumbnails attachments={[att]} onRemove={() => {}} />);
    const overlay = screen.getByLabelText(/upload failed/i);
    expect(overlay).toBeTruthy();
  });

  it("calls onRemove with the attachment id when the X button is clicked", () => {
    const onRemove = vi.fn();
    const att = makeAttachment({ id: "att-xyz", file: new File(["x"], "p.jpg") });
    render(<AttachmentThumbnails attachments={[att]} onRemove={onRemove} />);
    const removeBtn = screen.getByRole("button", { name: /remove p\.jpg/i });
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith("att-xyz");
  });
});
