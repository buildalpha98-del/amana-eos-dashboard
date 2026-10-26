// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivateTranscriptForm } from "@/components/meetings/PrivateTranscriptForm";
import { MeetingAiReviewPanel } from "@/components/meetings/MeetingAiReviewPanel";

const state = vi.hoisted(() => ({
  save: vi.fn(), refetch: vi.fn(),
  records: { data: undefined as unknown[] | undefined, isPending: false, isError: false, isFetching: false },
}));
vi.mock("@/lib/fetch-api", () => ({ mutateApi: (...args: unknown[]) => state.save(...args) }));
vi.mock("@/hooks/useMeetingRecordings", () => ({
  useMeetingRecordings: () => ({ ...state.records, refetch: state.refetch }),
  useActionItemDecision: () => ({}), useMissedItemDecision: () => ({}),
}));
function wrap(ui: React.ReactNode, query = new QueryClient()) {
  return <QueryClientProvider client={query}>{ui}</QueryClientProvider>;
}
beforeEach(() => {
  vi.clearAllMocks();
  state.records = { data: [], isPending: false, isError: false, isFetching: false };
});
describe("private meeting notes", () => {
  it("preserves a failed save for retry and stops edits while a save is pending", async () => {
    let reject!: (error: Error) => void;
    state.save.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    render(wrap(<PrivateTranscriptForm meetingId="m1" />));
    const input = screen.getByLabelText("Written notes or transcript");
    fireEvent.change(input, { target: { value: "Synthetic decisions" } });
    fireEvent.click(screen.getByRole("button", { name: "Save privately" }));
    expect(input).toHaveAttribute("readonly");
    reject(new Error("Private storage is unavailable."));
    await screen.findByRole("alert");
    expect(input).toHaveValue("Synthetic decisions");
    state.save.mockResolvedValue({ id: "saved" });
    fireEvent.click(screen.getByRole("button", { name: "Save privately" }));
    await screen.findByRole("status");
    expect(input).toHaveValue("");
    expect(state.save).toHaveBeenLastCalledWith("/api/meetings/m1/transcripts", { method: "POST", body: { text: "Synthetic decisions" } });
  });
  it("does not confuse a refresh failure with a failed save", async () => {
    state.save.mockResolvedValue({ id: "saved" });
    const query = new QueryClient();
    vi.spyOn(query, "invalidateQueries").mockRejectedValue(new Error("Refresh failed"));
    render(wrap(<PrivateTranscriptForm meetingId="m1" />, query));
    fireEvent.change(screen.getByLabelText("Written notes or transcript"), { target: { value: "Synthetic notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Save privately" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Notes saved privately");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("never carries a sensitive draft into another meeting", () => {
    const query = new QueryClient();
    const view = render(wrap(<PrivateTranscriptForm meetingId="m1" />, query));
    fireEvent.change(screen.getByLabelText("Written notes or transcript"), { target: { value: "Meeting one only" } });
    view.rerender(wrap(<PrivateTranscriptForm meetingId="m2" />, query));
    expect(screen.getByLabelText("Written notes or transcript")).toHaveValue("");
  });
  it("offers retry instead of claiming failed records are empty", () => {
    state.records.isError = true;
    render(wrap(<MeetingAiReviewPanel meetingId="m1" canManage={false} />));
    expect(screen.getByRole("alert")).toHaveTextContent("have not been removed");
    expect(screen.queryByText(/No meeting records have been saved/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("makes saved text readable even without an AI review and labels processing as paused", async () => {
    state.records.data = [{ id: "r1", source: "upload", status: "transcribed", transcriptText: "Existing synthetic transcript", aiReview: null, createdAt: "2026-10-25T23:30:00Z" }];
    render(wrap(<MeetingAiReviewPanel meetingId="m1" canManage={false} />));
    expect(screen.getByText("Processing paused")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Read saved transcript"));
    await waitFor(() => expect(screen.getByText("Existing synthetic transcript")).toBeVisible());
    expect(screen.getByText(/Saved 26 Oct 2026/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
