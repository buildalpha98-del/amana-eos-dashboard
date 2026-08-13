/**
 * Prisma client mock for unit tests.
 *
 * Usage:
 *   import { prismaMock } from "../helpers/prisma-mock";
 *
 * All Prisma models become vi.fn() stubs. Chain with mockResolvedValue:
 *   prismaMock.rock.findMany.mockResolvedValue([...]);
 */

import { vi } from "vitest";

// Build a recursive proxy that returns vi.fn() for any method access.
// This lets us mock any prisma.model.method() without enumerating all models.
function createPrismaMock() {
  const cache: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};

  // Support prisma.$transaction([...]) — resolves all promises in the array
  const $transaction = vi.fn(async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    // Interactive transaction: pass a mock client (the proxy itself)
    if (typeof arg === "function") return arg(proxy);
    return arg;
  });

  // Support prisma.$queryRawUnsafe(...) — raw SQL queries
  const $queryRawUnsafe = vi.fn();
  // ...and prisma.$queryRaw`...` — the tagged-template form, used where
  // a query has to read inside a JSON column (see the parent magic-link
  // lookup). Without this the proxy handed back a model object and the
  // route died with a 500 that looked like a route bug.
  const $queryRaw = vi.fn();

  // Support prisma.$queryRaw`...` — tagged-template raw queries
  const $queryRaw = vi.fn();

  const proxy = new Proxy(
    { $transaction, $queryRawUnsafe, $queryRaw } as Record<string, unknown>,
    {
      get(target, model: string) {
        // Return top-level callable methods directly
        if (model === "$transaction") return target.$transaction;
        if (model === "$queryRawUnsafe") return target.$queryRawUnsafe;
        if (model === "$queryRaw") return target.$queryRaw;

        if (!cache[model]) {
          cache[model] = new Proxy(
            {} as Record<string, ReturnType<typeof vi.fn>>,
            {
              get(methodCache: Record<string, ReturnType<typeof vi.fn>>, method: string) {
                if (!methodCache[method]) {
                  const fn = vi.fn();
                  // Sane defaults matching Prisma's real return contract, so a
                  // route that calls an un-mocked collection method doesn't blow
                  // up on `undefined` (e.g. getCentreScope() maps over
                  // userServiceMembership.findMany()). Any test can still
                  // override with its own mockResolvedValue.
                  if (model === "room") {
                    /**
                     * Rooms resolve by default.
                     *
                     * Since Stage 1 of the rooms migration every write
                     * that carries a session slot also resolves a
                     * `roomId`, and on most models that column is NOT
                     * NULL — so an unresolvable room is a thrown error,
                     * not a null. Without a default here every route
                     * test that creates a booking, shift or attendance
                     * record would fail on plumbing rather than on
                     * anything it meant to assert.
                     *
                     * A test that cares about the room — the resolver's
                     * own tests, or one checking the "no room set up"
                     * error — overrides this as usual.
                     */
                    if (method === "findUnique") {
                      fn.mockResolvedValue({
                        id: "room-test",
                        legacyKey: "asc",
                        // Stage 2 reads select these too — a room the
                        // read path can't NAME reads as a blank tab.
                        name: "Amana Afternoons",
                        archivedAt: null,
                      });
                    } else if (method === "findMany") {
                      fn.mockResolvedValue(
                        ["bsc", "asc", "vc", "extra1", "extra2", "extra3", "extra4"].map(
                          (legacyKey) => ({
                            id: `room-${legacyKey}`,
                            legacyKey,
                            name: legacyKey,
                            archivedAt: null,
                          }),
                        ),
                      );
                    } else if (method === "count") {
                      fn.mockResolvedValue(0);
                    }
                  } else if (method === "findMany") fn.mockResolvedValue([]);
                  else if (method === "count") fn.mockResolvedValue(0);
                  methodCache[method] = fn;
                }
                return methodCache[method];
              },
            },
          ) as Record<string, ReturnType<typeof vi.fn>>;
        }
        return cache[model];
      },
    },
  );

  return proxy;
}

export const prismaMock = createPrismaMock() as any;

// Auto-mock the prisma module
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));
