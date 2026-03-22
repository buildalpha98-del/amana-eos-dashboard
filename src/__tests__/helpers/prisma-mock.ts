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

  const proxy = new Proxy(
    { $transaction } as Record<string, unknown>,
    {
      get(target, model: string) {
        // Return $transaction directly for top-level callable methods
        if (model === "$transaction") return target.$transaction;

        if (!cache[model]) {
          cache[model] = new Proxy(
            {} as Record<string, ReturnType<typeof vi.fn>>,
            {
              get(methodCache: Record<string, ReturnType<typeof vi.fn>>, method: string) {
                if (!methodCache[method]) {
                  methodCache[method] = vi.fn();
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
