import { z } from "zod";

export const HANDOFF_STEPS = {
  children: "All children entered and linked in OWNA",
  invitation: "Invitation sent or existing access confirmed",
  access: "Parent can access the OWNA app",
  sessions: "First sessions confirmed for all children",
} as const;
export type HandoffStep = keyof typeof HANDOFF_STEPS;
const actor = z.object({ id: z.string(), name: z.string() });
const completion = z.object({
  at: z.string(),
  by: actor,
  evidence: z.string(),
  mode: z.enum(["sent", "existing"]).optional(),
});
export const handoffStateSchema = z.object({
  placement: z.string(),
  owner: actor.nullable(),
  note: z.string(),
  steps: z.object({
    children: completion.optional(),
    invitation: completion.optional(),
    access: completion.optional(),
    sessions: completion.optional(),
  }),
});
export type HandoffState = z.infer<typeof handoffStateSchema>;
export const handoffPatchSchema = z
  .object({
    revision: z.number().int().min(0),
    action: z.enum(["claim", "release", "note", "complete", "reopen", "reset"]),
    step: z.enum(["children", "invitation", "access", "sessions"]).optional(),
    evidence: z.string().trim().max(1000).optional(),
    mode: z.enum(["sent", "existing"]).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (["complete", "reopen"].includes(v.action) && !v.step)
      ctx.addIssue({ code: "custom", message: "Choose a checklist step" });
    if (["complete", "reopen", "reset"].includes(v.action) && !v.evidence)
      ctx.addIssue({ code: "custom", message: "Add evidence or a reason" });
    if (v.action === "complete" && v.step === "invitation" && !v.mode)
      ctx.addIssue({
        code: "custom",
        message: "Choose invitation sent or existing access",
      });
  });
export type HandoffPatch = z.infer<typeof handoffPatchSchema>;
export type HandoffPlacement = {
  serviceId: string | null;
  processedAt?: Date | string | null;
  childRecords: {
    id: string;
    serviceId: string | null;
    status: string;
  }[];
};
export function placementKey(e: HandoffPlacement) {
  return JSON.stringify([
    e.serviceId,
    e.processedAt ? new Date(e.processedAt).toISOString() : null,
    e.childRecords
      .map((c) => [c.id, c.serviceId, c.status])
      .sort((a, b) => a[0]!.localeCompare(b[0]!)),
  ]);
}
export function readHandoff(value: unknown): HandoffState | null {
  const parsed = handoffStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function handoffSummary(
  state: HandoffState | null,
  placement: string,
  status: string,
) {
  if (status !== "processed") return "OWNA: awaiting approval";
  if (!state) return "OWNA: not checked";
  if (state.placement !== placement) return "OWNA: recheck placement";
  const done = Object.keys(state.steps).length;
  return done === 4 ? "OWNA: handoff complete" : `OWNA: ${done}/4 checked`;
}
export function applyHandoff(
  state: HandoffState,
  patch: HandoffPatch,
  by: { id: string; name: string },
  placement: string,
  now: string,
): HandoffState {
  if (patch.action === "reset")
    return { placement, owner: state.owner, note: patch.evidence!, steps: {} };
  if (state.placement !== placement)
    throw new Error(
      "Enrolment details changed. Reset and recheck this handoff first.",
    );
  const next = structuredClone(state);
  if (patch.action === "claim") next.owner = by;
  if (patch.action === "release") next.owner = null;
  if (patch.action === "note") next.note = patch.evidence ?? "";
  if (patch.action === "reopen") {
    delete next.steps[patch.step!];
    // Reopening a prerequisite also reopens dependent checks.
    if (patch.step === "children") next.steps = {};
    if (patch.step === "invitation") delete next.steps.access;
  }
  if (patch.action === "complete") {
    if (!next.owner)
      throw new Error("Claim ownership before completing checks.");
    if (patch.step !== "children" && !next.steps.children)
      throw new Error("Check the OWNA child records first.");
    if (patch.step === "access" && !next.steps.invitation)
      throw new Error("Record the invitation or existing access first.");
    next.steps[patch.step!] = {
      at: now,
      by,
      evidence: patch.evidence!,
      ...(patch.step === "invitation" ? { mode: patch.mode } : {}),
    };
  }
  return next;
}
