import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/knox/enqueue", () => ({ enqueueTriage: vi.fn() }));
vi.mock("@/lib/knox/worker", () => ({ runTriageJob: vi.fn() }));
vi.mock("@/lib/run-after", () => ({ runAfter: vi.fn() }));

import {
  complaintTriggerChanged,
  incidentTriggerChanged,
  triggerTriage,
} from "@/lib/knox/trigger";
import { enqueueTriage } from "@/lib/knox/enqueue";
import { runTriageJob } from "@/lib/knox/worker";
import { runAfter } from "@/lib/run-after";

const incidentBefore = {
  severity: "minor",
  incidentType: "injury",
  reportableToAuthority: false,
  seriousIncidentCategory: null,
  ambulanceCalled: false,
  medicalPersonnelContacted: null as string | null,
};

describe("incidentTriggerChanged", () => {
  it("is false for cosmetic edits and for re-sending the same values", () => {
    expect(incidentTriggerChanged(incidentBefore, { description: "More" })).toBe(false);
    expect(incidentTriggerChanged(incidentBefore, { severity: "minor", ambulanceCalled: false })).toBe(false);
    expect(incidentTriggerChanged(incidentBefore, { followUpRequired: true })).toBe(false);
  });

  it.each([
    [{ severity: "serious" }],
    [{ incidentType: "illness" }],
    [{ reportableToAuthority: true }],
    [{ seriousIncidentCategory: "serious_injury" }],
    [{ ambulanceCalled: true }],
    [{ medicalPersonnelContacted: "Dr Lee" }],
  ])("is true when %j changes", (patch) => {
    expect(incidentTriggerChanged(incidentBefore, patch)).toBe(true);
  });

  it("only counts medicalPersonnelContacted going from empty to non-empty", () => {
    expect(incidentTriggerChanged({ ...incidentBefore, medicalPersonnelContacted: "Dr Lee" }, { medicalPersonnelContacted: "Dr Kim" })).toBe(false);
    expect(incidentTriggerChanged(incidentBefore, { medicalPersonnelContacted: "  " })).toBe(false);
    expect(incidentTriggerChanged(incidentBefore, { medicalPersonnelContacted: null })).toBe(false);
  });
});

describe("complaintTriggerChanged", () => {
  const before = { notifiable: false, notifiableReason: null as string | null, status: "new" };

  it("is false for notes, assignment and a same-value resend", () => {
    expect(complaintTriggerChanged(before, { investigationNotes: "x", assignedToId: "u1" })).toBe(false);
    expect(complaintTriggerChanged(before, { notifiable: false })).toBe(false);
    expect(complaintTriggerChanged(before, { status: "acknowledged" })).toBe(false);
  });

  it("is true for notifiable, reason and escalation", () => {
    expect(complaintTriggerChanged(before, { notifiable: true })).toBe(true);
    expect(complaintTriggerChanged(before, { notifiableReason: "serious_incident" })).toBe(true);
    expect(complaintTriggerChanged(before, { status: "escalated" })).toBe(true);
  });

  it("does not re-trigger a complaint that is already escalated", () => {
    expect(complaintTriggerChanged({ ...before, status: "escalated" }, { status: "escalated" })).toBe(false);
  });
});

describe("triggerTriage", () => {
  const input = { subjectType: "incident", subjectId: "i1", serviceId: "s1", reason: "created" } as const;

  beforeEach(() => {
    vi.mocked(enqueueTriage).mockReset();
    vi.mocked(runTriageJob).mockReset();
    vi.mocked(runAfter).mockReset();
  });

  it("resolves (never rejects) when enqueueTriage throws synchronously", async () => {
    vi.mocked(enqueueTriage).mockImplementation(() => {
      throw new Error("boom");
    });
    await expect(triggerTriage(input, { immediate: true })).resolves.toBeUndefined();
    expect(runAfter).not.toHaveBeenCalled();
  });

  it("resolves when enqueueTriage rejects", async () => {
    vi.mocked(enqueueTriage).mockRejectedValue(new Error("db down"));
    await expect(triggerTriage(input, { immediate: true })).resolves.toBeUndefined();
    expect(runAfter).not.toHaveBeenCalled();
  });

  it("resolves when runAfter throws", async () => {
    vi.mocked(enqueueTriage).mockResolvedValue("job-1");
    vi.mocked(runAfter).mockImplementation(() => {
      throw new Error("no request scope");
    });
    await expect(triggerTriage(input, { immediate: true })).resolves.toBeUndefined();
  });

  it("without immediate it queues, awaited, and never registers a run", async () => {
    vi.mocked(enqueueTriage).mockResolvedValue("job-1");
    await triggerTriage(input);
    expect(enqueueTriage).toHaveBeenCalledWith(expect.anything(), input);
    expect(runAfter).not.toHaveBeenCalled();
    expect(runTriageJob).not.toHaveBeenCalled();
  });

  it("with immediate it enqueues first, then registers runAfter with a task that runs the job", async () => {
    vi.mocked(enqueueTriage).mockResolvedValue("job-2");
    await triggerTriage(input, { immediate: true });

    expect(runAfter).toHaveBeenCalledOnce();
    expect(vi.mocked(enqueueTriage).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(runAfter).mock.invocationCallOrder[0],
    );
    expect(runTriageJob).not.toHaveBeenCalled();
    await vi.mocked(runAfter).mock.calls[0][0]();
    expect(runTriageJob).toHaveBeenCalledWith("job-2");
  });

  it("with immediate it does not call runAfter when enqueue returned null", async () => {
    vi.mocked(enqueueTriage).mockResolvedValue(null);
    await triggerTriage(input, { immediate: true });
    expect(runAfter).not.toHaveBeenCalled();
  });

  it("swallows a worker failure inside the deferred task", async () => {
    vi.mocked(enqueueTriage).mockResolvedValue("job-3");
    vi.mocked(runTriageJob).mockRejectedValue(new Error("model down"));
    await triggerTriage(input, { immediate: true });
    await expect(vi.mocked(runAfter).mock.calls[0][0]()).resolves.toBeUndefined();
  });
});
