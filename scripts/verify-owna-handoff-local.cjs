// Local-only, rollback-only verification of the handoff migration's triggers.
// Run with the isolated review DATABASE_URL; never point this at production.
const { PrismaClient } = require("@prisma/client");
const assert = require("node:assert/strict");
const url = new URL(process.env.DATABASE_URL || "postgresql://invalid");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  !(url.pathname === "/amana_ux_review" || /^\/amana_migration_[a-z0-9_]+$/.test(url.pathname))
)
  throw Error("Requires isolated localhost review or migration-test database");
const db = new PrismaClient();
const rollback = new Error("ROLLBACK_VERIFICATION");
(async () => {
  try {
    await db.$transaction(
      async (tx) => {
        const base = {
          primaryParent: {},
          children: [],
          emergencyContacts: [],
          consents: {},
          status: "processed",
        };
        const a = await tx.enrolmentSubmission.create({ data: base });
        const b = await tx.enrolmentSubmission.create({ data: base });
        const state = {
          placement: "original",
          owner: null,
          note: "",
          steps: {},
        };
        for (const e of [a, b])
          await tx.enrolmentOwnaHandoff.create({
            data: { enrolmentId: e.id, state },
          });
        const version = async (id) =>
          (
            await tx.enrolmentOwnaHandoff.findUniqueOrThrow({
              where: { enrolmentId: id },
            })
          ).revision;
        const child = await tx.child.create({
          data: {
            firstName: "Synthetic",
            surname: "Trigger check",
            enrolmentId: a.id,
            status: "active",
            culturalBackground: [],
            medicalConditions: [],
            dietaryRequirements: [],
          },
        });
        assert.equal(await version(a.id), 2, "insert invalidates");
        await tx.child.update({
          where: { id: child.id },
          data: { ownaSyncedAt: new Date(), status: "active" },
        });
        assert.equal(
          await version(a.id),
          2,
          "unchanged sync must not invalidate",
        );
        await tx.child.update({
          where: { id: child.id },
          data: { status: "withdrawn" },
        });
        await tx.child.update({
          where: { id: child.id },
          data: { status: "active" },
        });
        assert.equal(
          await version(a.id),
          4,
          "status roundtrip remains invalidated",
        );
        await tx.child.update({
          where: { id: child.id },
          data: { bookingPrefs: { startDate: "2026-10-12" } },
        });
        assert.equal(await version(a.id), 5, "booking changes invalidate");
        await tx.child.update({
          where: { id: child.id },
          data: { bookingPrefs: { startDate: "2026-10-12" } },
        });
        assert.equal(
          await version(a.id),
          5,
          "identical booking values do not invalidate",
        );
        await tx.child.update({
          where: { id: child.id },
          data: { enrolmentId: b.id },
        });
        assert.equal(await version(a.id), 6, "old enrolment invalidated");
        assert.equal(await version(b.id), 2, "new enrolment invalidated");
        await tx.child.delete({ where: { id: child.id } });
        assert.equal(await version(b.id), 3, "delete invalidates");
        await tx.enrolmentSubmission.update({
          where: { id: a.id },
          data: { status: "archived" },
        });
        await tx.enrolmentSubmission.update({
          where: { id: a.id },
          data: { status: "processed" },
        });
        assert.equal(
          await version(a.id),
          8,
          "approval roundtrip remains invalidated",
        );
        const result = await tx.enrolmentOwnaHandoff.findUniqueOrThrow({
          where: { enrolmentId: a.id },
        });
        assert.match(result.state.placement, /^invalidated:/);
        assert.deepEqual(result.state.steps, {});
        throw rollback;
      },
      { timeout: 20000 },
    );
  } catch (e) {
    if (e !== rollback) throw e;
  }
  console.log(
    "PASS: trigger insert/delete, no-op sync, status roundtrip, booking changes, reassociation and approval roundtrip. All verification writes rolled back.",
  );
})().finally(() => db.$disconnect());
