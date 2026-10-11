/** Local PostgreSQL check: npx tsx scripts/verify-attendance-overwrite-guards.ts
 *
 * Absent / undo from a screen without a version (weekly grid, bulk) must not
 * erase a sign-in or collection recorded since that screen loaded, and "book"
 * must never touch an existing record. Uses one synthetic child at the local
 * test centre and removes only that child's rows.
 */
import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

async function main() {
  loadEnvConfig(process.cwd());
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert(
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.pathname === "/amana_local",
    "This check requires the local amana_local database.",
  );
  const { prisma } = await import("../src/lib/prisma");
  const { recordArrival, recordDeparture } = await import(
    "../src/lib/attendance-handover"
  );
  const { assertAttendanceRevision, attendanceRevision } = await import(
    "../src/lib/attendance-revision"
  );
  const { requireRoomId } = await import("../src/lib/room-resolver");
  const actor = await prisma.user.findUnique({
    where: { email: "test-staff@amana-test.local" },
  });
  assert(actor?.serviceId, "Local synthetic educator is required.");
  const child = await prisma.child.create({
    data: {
      serviceId: actor.serviceId,
      firstName: "Overwrite guard verification",
      surname: randomUUID(),
      culturalBackground: [],
      medicalConditions: [],
      dietaryRequirements: [],
    },
  });
  const serviceId = actor.serviceId;
  const date = new Date("2026-10-12T00:00:00Z");
  const sessionType = "asc" as const;
  const key = { childId: child.id, serviceId, date, sessionType };
  const roomId = await requireRoomId(serviceId, sessionType);
  const read = () =>
    prisma.attendanceRecord.findUnique({
      where: { childId_serviceId_date_sessionType: key },
    });
  /** Runs the guard as the routes do; rolls back whatever it would write. */
  const guard = (action: string, expectedRevision?: string | null) =>
    prisma
      .$transaction(async (tx) => {
        await assertAttendanceRevision(tx, {
          ...key, roomId, action, actorId: actor.id, expectedRevision,
        });
        throw new Error("ALLOWED");
      })
      .then(
        () => "ALLOWED",
        (err: Error) =>
          err.message === "ALLOWED" ? "ALLOWED" : `REFUSED ${(err as { status?: number }).status}`,
      );

  try {
    await recordArrival(prisma, {
      ...key, roomId, action: "sign_in", at: new Date(), recordedById: actor.id,
    });
    const arrived = await read();
    assert(arrived?.signInTime);
    const seenAtArrival = attendanceRevision(arrived);

    // A screen that loaded before the arrival showed no record.
    assert.equal(await guard("undo", null), "REFUSED 409");
    assert.equal(await guard("mark_absent", null), "REFUSED 409");
    // An older client that sends nothing at all.
    assert.equal(await guard("undo"), "REFUSED 409");
    assert.equal(await guard("mark_absent"), "REFUSED 409");
    // Arrival/collection/note without a version keep working (conditional writes).
    assert.equal(await guard("sign_out"), "ALLOWED");
    // The screen that saw the arrival may undo it.
    assert.equal(await guard("undo", seenAtArrival), "ALLOWED");

    // Collected since that screen loaded: its version is now stale.
    await recordDeparture(prisma, {
      ...key, roomId, action: "sign_out", at: new Date(), recordedById: actor.id,
    });
    assert.equal(await guard("mark_absent", seenAtArrival), "REFUSED 409");
    const collected = await read();
    assert(collected?.signInTime && collected.signOutTime, "Hand-over intact");

    // "book" (createMany skipDuplicates) leaves the existing record alone.
    const booked = await prisma.attendanceRecord.createMany({
      data: [{ ...key, roomId, status: "booked" }],
      skipDuplicates: true,
    });
    assert.equal(booked.count, 0);
    const after = await read();
    assert.equal(attendanceRevision(after!), attendanceRevision(collected));

    console.log("PASS: stale absent/undo refused; hand-over intact; book never overwrites");
  } finally {
    await prisma.attendanceRecord.deleteMany({ where: { childId: child.id } });
    await prisma.child.delete({ where: { id: child.id } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
