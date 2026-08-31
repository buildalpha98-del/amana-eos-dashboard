/**
 * GET /api/parent/centres
 *
 * Returns the centre(s) a logged-in parent's children attend, with each
 * service's editable content payload (About narrative, hero image, key
 * contacts, daily routine, food provider, parent onboarding) merged
 * over the defaults.
 *
 * Surfaces the work in PR #113 to the parent portal — Directors of
 * Service can now customise their centre's About / contacts and parents
 * actually see those edits.
 *
 * 2026-05-16.
 */

import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { mergeServiceContent } from "@/lib/service-content-shared";
import {
  bookableSessionKeys,
  type SessionKey,
  type SessionTimes,
} from "@/lib/service-settings";
import { desiredRooms } from "@/lib/rooms-mapping";

/**
 * A room as the booking form needs it.
 *
 * Stage 2 of docs/rooms-migration-plan.md. `id` is nullable because of
 * the fallback below — a derived room genuinely has no record yet, and
 * saying so beats inventing an id that resolves to nothing.
 */
interface ParentRoom {
  id: string | null;
  legacyKey: SessionKey | null;
  name: string;
  startTime: string | null;
  endTime: string | null;
}

/**
 * Session keys this centre is currently accepting casual bookings for.
 *
 * Read permissively — an unparseable blob means "nothing enabled",
 * which shows the family no options rather than every option.
 */
function enabledCasualSessions(
  raw: unknown,
  sessionTimes: SessionTimes | null,
): string[] {
  if (!raw || typeof raw !== "object") return [];
  // A room can be retired or staff-only in the room config while its
  // casual settings still say "enabled" — the two objects are separate
  // and drift. The room config is the one that decides.
  const bookable = new Set<string>(bookableSessionKeys(sessionTimes));
  return Object.entries(raw as Record<string, unknown>)
    .filter(([key, v]) => {
      if (key === "policy" || !v || typeof v !== "object") return false;
      if (!bookable.has(key)) return false;
      return (v as { enabled?: unknown }).enabled === true;
    })
    .map(([key]) => key);
}

/**
 * Which weekdays each ENABLED session actually runs.
 *
 * The booking form needs this to hide days a family can't book at all —
 * most centres run Monday to Friday, and a Saturday chip that 400s when
 * pressed is a trap, not an option. Read from the same per-session
 * `days` list staff configure under Daily Ops → Casual Bookings, so a
 * centre that IS open Saturdays gets its Saturday back automatically.
 */
function enabledCasualSessionDays(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (key === "policy" || !v || typeof v !== "object") continue;
    const session = v as { enabled?: unknown; days?: unknown };
    if (session.enabled !== true) continue;
    out[key] = Array.isArray(session.days)
      ? session.days.filter((d): d is string => typeof d === "string")
      : [];
  }
  return out;
}

export const GET = withParentAuth(async (_req, { parent }) => {
  // Look up every Service the parent's children attend. Children attendance
  // comes through `EnrolmentSubmission.childRecords[].serviceId` and the
  // JSON `children` array (for legacy enrolments without records).
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: {
      id: { in: parent.enrolmentIds },
      status: { not: "draft" },
    },
    select: {
      serviceId: true,
      childRecords: {
        select: { serviceId: true },
      },
    },
  });

  const serviceIds = new Set<string>();
  for (const e of enrolments) {
    if (e.serviceId) serviceIds.add(e.serviceId);
    for (const c of e.childRecords) {
      if (c.serviceId) serviceIds.add(c.serviceId);
    }
  }

  if (serviceIds.size === 0) {
    return NextResponse.json({ centres: [] });
  }

  const services = await prisma.service.findMany({
    where: { id: { in: Array.from(serviceIds) } },
    select: {
      id: true,
      name: true,
      code: true,
      address: true,
      suburb: true,
      state: true,
      postcode: true,
      phone: true,
      email: true,
      content: true,
      // Which programmes this centre takes casual bookings for. Parents
      // must only ever be offered a programme the centre has turned ON —
      // otherwise Holiday Quest (and any unused extra room) shows up as
      // bookable at a centre that doesn't run it.
      casualBookingSettings: true,
      // Not sent to the client any more — rooms travel as records. Still
      // read here because the casual-booking filter is keyed by slot,
      // and because the no-rooms fallback derives from it.
      sessionTimes: true,
    },
    orderBy: { name: "asc" },
  });

  /**
   * The rooms themselves, as records.
   *
   * The booking form used to build its options by enumerating the seven
   * enum slots and looking each one up in `sessionTimes`. That is what
   * made an eighth room impossible to offer a family — not the storage,
   * which has had a `Room` table since Stage 0, but the fact that
   * nothing ASKED for the rooms.
   *
   * Staff-only and retired rooms are excluded here rather than in the
   * form: a family should never be offered either, and a filter the
   * caller can forget to apply is a filter that will be forgotten.
   */
  const roomRows = await prisma.room.findMany({
    where: {
      serviceId: { in: Array.from(serviceIds) },
      archivedAt: null,
      staffOnly: false,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      serviceId: true,
      legacyKey: true,
      name: true,
      startTime: true,
      endTime: true,
    },
  });

  const roomsByService = new Map<string, ParentRoom[]>();
  for (const r of roomRows) {
    const list = roomsByService.get(r.serviceId) ?? [];
    list.push({
      id: r.id,
      legacyKey: r.legacyKey as SessionKey | null,
      name: r.name,
      startTime: r.startTime,
      endTime: r.endTime,
    });
    roomsByService.set(r.serviceId, list);
  }

  /**
   * A centre with no room records falls back to deriving them.
   *
   * Every write path that creates or edits a service syncs its rooms,
   * and the Stage 0 backfill covered the rest — so this should never
   * fire. But `syncRoomsQuietly` swallows its failures by design, and
   * the cost of being wrong here is a family opening the booking form
   * to no programmes at all, with nothing to tell them why. Deriving
   * from the same JSON the sync uses is a cheap, pure way to make that
   * failure invisible to parents rather than total.
   */
  function roomsFor(id: string, sessionTimes: SessionTimes | null) {
    const stored = roomsByService.get(id);
    if (stored?.length) return stored;
    return desiredRooms(sessionTimes)
      .filter((r) => !r.disabled && !r.staffOnly)
      .map(
        (r): ParentRoom => ({
          id: null,
          legacyKey: r.legacyKey,
          name: r.name,
          startTime: r.startTime,
          endTime: r.endTime,
        }),
      );
  }

  // Resolve the policy documents each centre has selected. Fetched in one
  // query across all of them, and filtered to category "policy" here so a
  // stale id pointing at some other document can't leak an HR file into a
  // parent's portal.
  const wantedPolicyIds = new Set<string>();
  const contentByService = new Map(
    services.map((s) => {
      const merged = mergeServiceContent(s.content);
      for (const id of merged.policyDocumentIds) wantedPolicyIds.add(id);
      return [s.id, merged];
    }),
  );

  const policyDocs =
    wantedPolicyIds.size > 0
      ? await prisma.document.findMany({
          where: {
            id: { in: [...wantedPolicyIds] },
            category: "policy",
            deleted: false,
          },
          select: { id: true, title: true, fileUrl: true, fileName: true },
        })
      : [];
  const policyById = new Map(policyDocs.map((d) => [d.id, d]));

  const centres = services.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    address: [s.address, s.suburb, s.state, s.postcode]
      .filter((x) => x && x.length > 0)
      .join(", "),
    phone: s.phone,
    email: s.email,
    content: contentByService.get(s.id)!,
    casualSessions: enabledCasualSessions(
      s.casualBookingSettings,
      (s.sessionTimes ?? null) as SessionTimes | null,
    ),
    casualSessionDays: enabledCasualSessionDays(s.casualBookingSettings),
    rooms: roomsFor(s.id, (s.sessionTimes ?? null) as SessionTimes | null),
    // Order follows the admin's selection, not the database's.
    policies: (contentByService.get(s.id)?.policyDocumentIds ?? [])
      .map((id) => policyById.get(id))
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .map((d) => ({
        id: d.id,
        name: d.title,
        fileUrl: d.fileUrl,
        fileName: d.fileName,
      })),
  }));

  return NextResponse.json({ centres });
});
