// Runs only on an explicitly named, isolated localhost migration-test database.
// CI starts with an empty PostgreSQL service: db push must never prepare this DB.
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '..');
for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']) {
  const url = new URL(process.env[key] || 'postgresql://invalid');
  assert(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/amana_migration_[a-z0-9_]+$/.test(url.pathname), `${key} must target an isolated localhost migration-test database`);
}
assert.equal(process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED, 'Both connections must target the same test database');
const run = (...args) => {
  const r = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) throw Error(r.error?.message || r.stderr || r.stdout || `Command exited ${r.status}`);
  return r.stdout;
};
const prisma = resolve(root, 'node_modules/prisma/build/index.js');
run(prisma, 'migrate', 'deploy');
assert.match(run(prisma, 'migrate', 'deploy'), /No pending migrations/);
run(prisma, 'migrate', 'status');
const diff = run(prisma, 'migrate', 'diff', '--from-schema-datasource', 'prisma/schema.prisma', '--to-schema-datamodel', 'prisma/schema.prisma', '--script');
const normalize = s => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
const expected = readFileSync(resolve(root, 'tests/fixtures/migration-replay-drift.txt'), 'utf8');
assert.equal(normalize(diff), normalize(expected), 'Migration replay schema changed. Inspect the diff; never automatically update the accepted historical metadata.');
console.log(run(resolve(root, 'scripts/verify-owna-handoff-local.cjs')).trim());
console.log('PASS: migrations deploy, second deploy is a no-op, status is current, and schema matches the reviewed metadata baseline.');
