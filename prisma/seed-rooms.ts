import { PrismaClient, type SessionType } from "@prisma/client";
import { desiredRooms } from "../src/lib/rooms-mapping";
import type { SessionTimes } from "../src/lib/service-settings";

/**
 * Populate the `Room` shadow table from `Service.sessionTimes`.
 *
 * Stage 0 of docs/rooms-migration-plan.md. Nothing reads these rows yet —
 * they exist so the derivation can be run, checked against its source and
 * corrected while the app carries on reading the JSON exactly as before.
 *
 * FULLY IDEMPOTENT, and it has to be: this runs as part of every deploy.
 * The rows hold no state of their own — every field is re-derived from
 * the JSON — so a re-run converges rather than accumulating.
 *
 * Imported by relative path, not the `@/` alias: this runs under tsx
 * outside Next's module resolution. `rooms-mapping` is the half of the
 * rooms code with no database import, which is why it can be pulled in
 * here without the prisma singleton coming with it.
 */
export async function seedRooms(prisma: PrismaClient): Promise<void> {
  const services = await prisma.service.findMany({
    select: { id: true, name: true, sessionTimes: true },
  });

  let created = 0;
  let updated = 0;
  let orphaned = 0;

  for (const service of services) {
    const desired = desiredRooms(service.sessionTimes as SessionTimes | null);

    const existing = await prisma.room.findMany({
      where: { serviceId: service.id },
      select: { id: true, legacyKey: true, archivedAt: true },
    });
    const byKey = new Map(
      existing
        .filter((r) => r.legacyKey)
        .map((r) => [r.legacyKey as string, r]),
    );

    for (const room of desired) {
      const current = byKey.get(room.legacyKey);
      const fields = {
        name: room.name,
        startTime: room.startTime,
        endTime: room.endTime,
        capacity: room.capacity,
        ratio: room.ratio,
        description: room.description,
        minAgeYears: room.minAgeYears,
        maxAgeYears: room.maxAgeYears,
        staffOnly: room.staffOnly,
        photoUrl: room.photoUrl,
        sortOrder: room.sortOrder,
      };

      if (!current) {
        await prisma.room.create({
          data: {
            serviceId: service.id,
            legacyKey: room.legacyKey as SessionType,
            ...fields,
            archivedAt: room.disabled ? new Date() : null,
          },
        });
        created += 1;
        continue;
      }

      // The retirement timestamp is written on the transition only —
      // re-stamping it every deploy would make "when did this room
      // close" permanently read as the last deploy date.
      await prisma.room.update({
        where: { id: current.id },
        data: {
          ...fields,
          archivedAt: room.disabled ? (current.archivedAt ?? new Date()) : null,
        },
      });
      updated += 1;
    }

    // Reported, never deleted: a room only reaches this state by being
    // configured and then removed from the JSON, and it may have
    // attendance recorded against it.
    const wanted = new Set(desired.map((d) => d.legacyKey));
    orphaned += existing.filter(
      (r) => r.legacyKey && !wanted.has(r.legacyKey as never),
    ).length;
  }

  console.log(
    `  Rooms (shadow): ${created} created, ${updated} refreshed across ${services.length} services` +
      (orphaned > 0 ? ` — ${orphaned} orphaned row(s), left in place` : ""),
  );
}
