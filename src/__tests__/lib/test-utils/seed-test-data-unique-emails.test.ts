import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression guard: seedTestData() must produce unique User emails.
 *
 * History: PR #37 (2026-04-30) collapsed the `coordinator` role into
 * `member`. A sed pass over the codebase replaced `coordinator` literals
 * with `member`, which left a stale `["member", "member"]` in the
 * seedTestData ROLES array. Each role becomes
 * `test-${role}@amana-test.local`, so the second `member` collided with
 * the first and threw a unique-constraint violation on every fresh-DB
 * seed run. The 2026-05-04 scheduled E2E run on main caught it.
 *
 * This test mocks the Prisma client to record every `user.create` call
 * and asserts the resulting emails are all distinct. It runs without a
 * real database, so it is fast and durable across schema changes.
 */

type CreateCall = { table: string; data: Record<string, unknown> };
const createCalls: CreateCall[] = [];

vi.mock("@/lib/prisma", () => {
  let nextId = 1;
  // Build a Proxy that returns a no-op CRUD object for every table name
  const tableProxy = (table: string) => ({
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      createCalls.push({ table, data });
      const id = `${table}-${nextId++}`;
      return { ...data, id };
    }),
    createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
      for (const row of data) createCalls.push({ table, data: row });
      return { count: data.length };
    }),
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
    findFirst: vi.fn(async () => null),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
      const id = `${table}-${nextId++}`;
      return { ...create, id };
    }),
    delete: vi.fn(async () => ({})),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    count: vi.fn(async () => 0),
  });
  const prisma = new Proxy(
    {
      $transaction: vi.fn(async <T>(fn: ((tx: unknown) => Promise<T>) | Promise<T>[]) => {
        if (typeof fn === "function") return fn(prisma as unknown);
        return Promise.all(fn);
      }),
    },
    {
      get: (target, prop: string) => {
        if (prop in target) return (target as Record<string, unknown>)[prop];
        return tableProxy(prop);
      },
    },
  );
  return { prisma };
});

import { seedTestData } from "@/lib/test-utils/seed-test-data";

describe("seedTestData", () => {
  beforeEach(() => {
    createCalls.length = 0;
  });

  it("creates only unique User emails (no duplicate-key collision)", async () => {
    await seedTestData();
    const userEmails = createCalls
      .filter((c) => c.table === "user")
      .map((c) => c.data.email as string);
    expect(userEmails.length).toBeGreaterThan(0);
    expect(new Set(userEmails).size).toBe(userEmails.length);
  });
});
