/** Local PostgreSQL check: npx tsx scripts/verify-attendance-mutation.ts */
import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

async function main() {
  loadEnvConfig(process.cwd());
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert(
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.pathname === "/amana_local",
    "This check requires the local amana_local database.",
  );
  const { prisma } = await import("../src/lib/prisma");
  const { runAttendanceMutation } = await import(
    "../src/lib/attendance-mutation"
  );
  const { recordArrival } = await import("../src/lib/attendance-handover");
  const actor = await prisma.user.findUnique({
    where: { email: "test-staff@amana-test.local" },
  });
  assert(actor?.serviceId, "Local synthetic educator is required.");
  const child = await prisma.child.create({
    data: {
      serviceId: actor.serviceId,
      firstName: "Ledger verification",
      surname: randomUUID(),
      culturalBackground: [],
      medicalConditions: [],
      dietaryRequirements: [],
    },
  });
  try {
    const input = {
      clientMutationId: randomUUID(),
      serviceId: actor.serviceId,
      childId: child.id,
      actorId: actor.id,
      date: new Date("2026-10-12T00:00:00Z"),
      sessionType: "asc" as const,
      action: "sign_in",
      payload: { action: "sign_in", notes: "Original" },
    };
    const { requireRoomId, _clearRoomCache } = await import(
      "../src/lib/room-resolver"
    );
    const roomId = await requireRoomId(input.serviceId, input.sessionType);
    _clearRoomCache(); // Prove writes do not need a spare global pool connection.
    let writes = 0;
    const write = async (tx: Prisma.TransactionClient) => {
      writes++;
      const result = await recordArrival(tx, {
        ...input,
        roomId,
        action: "sign_in",
        at: new Date("2026-10-12T04:00:00Z"),
        recordedById: actor.id,
        notes: "Original",
      });
      return {
        response: JSON.parse(
          JSON.stringify(result.record),
        ) as Prisma.InputJsonValue,
      };
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => runAttendanceMutation(input, write)),
    );
    assert.equal(writes, 1);
    for (const result of results)
      assert.deepEqual(result.response, results[0].response);
    assert.equal(
      await prisma.attendanceMutation.count({ where: { childId: child.id } }),
      1,
    );
    assert.equal(
      await prisma.attendanceRecord.count({ where: { childId: child.id } }),
      1,
    );

    await prisma.attendanceRecord.updateMany({
      where: { childId: child.id },
      data: {
        signInTime: null,
        signedInById: null,
        status: "booked",
        notes: "Later correction",
      },
    });
    assert.deepEqual(
      (await runAttendanceMutation(input, write)).response,
      results[0].response,
    );
    assert.equal(writes, 1);
    assert.equal(
      (
        await prisma.attendanceRecord.findFirstOrThrow({
          where: { childId: child.id },
        })
      ).signInTime,
      null,
    );

    await assert.rejects(
      runAttendanceMutation({ ...input, payload: { action: "undo" } }, write),
      /does not match/,
    );
    await assert.rejects(
      runAttendanceMutation({ ...input, actorId: "another-account" }, write),
      /does not match/,
    );
    assert.equal(writes, 1);

    const failedId = randomUUID();
    await assert.rejects(
      runAttendanceMutation(
        { ...input, clientMutationId: failedId },
        async (tx) => {
          await tx.attendanceRecord.updateMany({
            where: { childId: child.id },
            data: { notes: "Must roll back" },
          });
          throw new Error("Simulated aggregation failure");
        },
      ),
      /Simulated aggregation failure/,
    );
    assert.equal(
      await prisma.attendanceMutation.findUnique({ where: { id: failedId } }),
      null,
    );
    assert.equal(
      (
        await prisma.attendanceRecord.findFirstOrThrow({
          where: { childId: child.id },
        })
      ).notes,
      "Later correction",
    );
    const recovered = await runAttendanceMutation(
      { ...input, clientMutationId: failedId },
      async () => ({ response: { recovered: true } }),
    );
    assert.deepEqual(recovered.response, { recovered: true });
    console.log(
      "PASS: concurrent receipts, delayed replay, conflicting payload/account and atomic rollback/retry.",
    );
  } finally {
    // Only this run's synthetic child and its cascading receipts/attendance.
    await prisma.child.delete({ where: { id: child.id } });
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error("Local attendance mutation verification failed.");
  process.exitCode = 1;
});
