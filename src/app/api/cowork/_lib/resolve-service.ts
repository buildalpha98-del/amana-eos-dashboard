import { prisma } from "@/lib/prisma";

/**
 * Resolve a service code (e.g. "MFIS-BH") to its database record.
 * Returns null if the code doesn't match any service.
 */
export async function resolveServiceByCode(code: string) {
  return prisma.service.findUnique({
    where: { code },
    select: { id: true, name: true, code: true },
  });
}

/**
 * Resolve multiple service codes in a single query.
 * Returns a Map<code, { id, name, code }>.
 */
export async function resolveServicesByCode(codes: string[]) {
  const services = await prisma.service.findMany({
    where: { code: { in: codes } },
    select: { id: true, name: true, code: true },
  });

  const map = new Map<string, { id: string; name: string; code: string }>();
  for (const s of services) {
    map.set(s.code, s);
  }
  return map;
}
