/**
 * The door iPad's Parent mode (Round 4, 2026-10-09). Rules, per Daniel:
 *
 *  - only the parents / guardians on the child's enrolment sign on the
 *    iPad; anyone else collecting goes to an educator, who checks ID;
 *  - a child with a custody arrangement or court order is ALWAYS handed
 *    over by an educator ("Please see an educator" — the reason is never
 *    shown on a shared screen);
 *  - parents use it for sign-in and sign-out, every session;
 *  - no family PIN yet: PINs will be mass-emailed later. `PARENT_PIN_STEP`
 *    is the slot — when it exists, /api/door/sign checks it before
 *    recording anything.
 */
import { primaryParentSchema } from "@/lib/schemas/json-fields";

export type DoorAdultKey = "primary" | "secondary";

export interface DoorAdult {
  key: DoorAdultKey;
  firstName: string;
  fullName: string;
  relationship: string | null;
}

/** The enrolment's parents / guardians, in the order the form asks. */
export function doorAdults(enrolment: { primaryParent: unknown; secondaryParent: unknown } | null): DoorAdult[] {
  if (!enrolment) return [];
  const out: DoorAdult[] = [];
  for (const [key, raw] of [
    ["primary", enrolment.primaryParent],
    ["secondary", enrolment.secondaryParent],
  ] as const) {
    const parsed = primaryParentSchema.safeParse(raw ?? null);
    if (!parsed.success) continue;
    const first = parsed.data.firstName.trim();
    if (!first) continue;
    out.push({
      key,
      firstName: first,
      fullName: `${first} ${parsed.data.surname.trim()}`.trim(),
      relationship: parsed.data.relationship?.trim() || null,
    });
  }
  return out;
}

/** Custody arrangement or a court order on the enrolment → an educator hands over. */
export function needsEducator(
  child: { custodyArrangements: unknown },
  enrolment: { courtOrders: boolean } | null,
): boolean {
  return Boolean(child.custodyArrangements) || enrolment?.courtOrders === true;
}

export type DoorState = "arriving" | "here" | "gone" | "absent";

export function doorStateOf(record: { status: string; signOutTime: Date | null } | undefined): DoorState {
  if (!record || record.status === "booked") return "arriving";
  if (record.status === "absent") return "absent";
  return record.signOutTime ? "gone" : "here";
}
