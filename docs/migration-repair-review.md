# Migration repair — local release review

Branch: `codex/amana-parent-journey`, based on deployed main `4f524e4d`. No merge, push or deployment was performed. Production access was read-only metadata inspection; no family data, email or OWNA actions were changed.

## Problem and approach

Fresh replay stopped at `20260422120000_add_enrolment_owna_exported_at`: its target table, EnrolmentApplication, had been added to the Prisma schema without a CREATE TABLE migration. Other earlier schema-only additions were also missing. Existing CI used `db push`, which cannot verify migration history. The review branch was rebased onto deployed main so the existing parent-session security migration is included.

Three additive migrations repair the history:

- `20260422115900_restore_missing_portal_prerequisites`: creates ten omitted tables and PaymentMethod only when absent, before their first historical ALTER. Existing tables are untouched. A missing table in a database with completed later migrations raises an error instead of silently recreating an obsolete table shape. Transaction rollback was verified.
- `20261011000900_restore_missing_enum_values`: adds omitted BookingStatus and StatementStatus values. It is separate so values commit before being used as defaults.
- `20261011001000_restore_missing_schema_fields`: restores omitted fields, indexes and foreign keys. Removes an obsolete Statement period uniqueness constraint from fresh replay and aligns eight HR foreign-key actions with the current model. The production-schema rehearsal verified those existing production objects already match and remain unchanged.

No applied migration was edited, deleted or marked resolved. Production build migration policy remains unchanged. The OWNA feature migration, `20261010190000_enrolment_owna_handoff`, still installs both the table and invalidation triggers; schema push is not a substitute.

## Production metadata audit and upgrade rehearsal

Neon production had 184 finished migration records, no unresolved failures, and matching SHA256 checksums for every shared migration file. Three completed production-only history entries remain preserved: `20260707130000_daily_reflections_qip_suggestions`, `20260707200000_sat_element_structure`, and `20260927000000_knowledge_store`.

A local PostgreSQL 17 database was populated from read-only production enum, sequence, table, constraint and index definitions, plus the completed migration ledger. Four pending migrations (the OWNA feature and three repairs) applied successfully. A second deploy reported no pending migrations. Two synthetic rows were preserved. Before/after schema comparison showed only the OWNA table, its primary/foreign keys, three functions, two triggers and the missing EnrolmentDraft account index added. Existing exported objects were unchanged.

This was a schema-only rehearsal, not a customer-data clone. The catalog export excluded existing functions, triggers, views and sequence ownership; it cannot prove every interaction with production data or unexported database objects. No production migration was executed.

## Acceptance and verification

- Fresh empty database: all 185 repository migrations replayed successfully.
- Repeat deploy: no pending migrations; migration status current.
- Prisma shadow replay: succeeds and matches the reviewed residual metadata fixture.
- Mature-history/missing-table negative check: fails safely and rolls back.
- Production-schema upgrade rehearsal: four pending migrations apply, synthetic rows survive, existing exported objects remain unchanged; repeat deploy is a no-op.
- Rollback-only OWNA trigger checks: pass for reassociation, real placement/booking/lifecycle changes, preserved evidence and unchanged-sync stability.
- Full Vitest: 726 files, 7,632 tests passed, 3 skipped. Known jsdom navigation diagnostic is non-failing.
- Full lint: zero errors, 1,115 existing warnings.
- Both verification scripts parse, workflow YAML parses, and `git diff --check` passes.
- Production webpack build passed after Prisma generation: compilation, TypeScript, all 769 pages and build traces, using the isolated local environment.

The new CI migration-replay job uses an empty PostgreSQL service with test-only credentials. `scripts/verify-migration-replay.cjs` only accepts named localhost migration databases, checks deploy/idempotency/status, compares exact schema metadata and runs the rollback-only trigger checks. The exact local harness passed starting from an empty database; the GitHub Actions job has not run because this work has not been pushed.

Replay intentionally preserves a bounded set of historical metadata differences in `tests/fixtures/migration-replay-drift.txt`: 26 custom/nonunique indexes, two immutable parent-account foreign-key update actions, three timestamp defaults and an incident-index name. These are not missing application tables or columns. The fixture is an exact comparison, not an ignore list or SQL to execute, and must never be automatically refreshed. Zero schema drift is not claimed.

## Independent reviews

`migration_design_review` recommended additive prerequisites instead of rewriting applied history, safe refusal for inconsistent mature databases, fresh replay and an upgrade rehearsal. These requirements were implemented.

`migration_implementation_review` directly inspected all three migrations, the scripts, CI and fixture, checked script syntax and whitespace, and read replay/upgrade logs. No blocking defect was found. The reviewer did not independently execute database migrations or inspect production; the primary agent performed the recorded database and application checks.

## Release boundary and next action

Keep this branch unmerged for user review. Before an approved release, run CI on the exact pushed revision and recheck target migration status if production has changed. Deploy via the existing production build policy, which runs migrations before the application build. No production release is authorized by this review document.

Recommended working-agreement addition, based on this historical failure: every Prisma schema change should include a tracked migration and pass empty-database replay; `db push` alone is not migration validation. CI now enforces replay without changing project instruction files.
