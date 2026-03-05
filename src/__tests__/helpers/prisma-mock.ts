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

  return new Proxy(
    {} as Record<string, unknown>,
    {
      get(_target, model: string) {
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
}

export const prismaMock = createPrismaMock() as any;

// Auto-mock the prisma module
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));
