import { prisma } from "@/lib/prisma";
import type { Service } from "@prisma/client";

/**
 * Create a test service/centre with standard data.
 */
export async function createTestService(
  overrides?: Partial<Pick<Service, "name" | "code" | "state" | "capacity" | "status">>,
): Promise<Service> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  return prisma.service.create({
    data: {
      name: overrides?.name ?? `Test Centre ${suffix}`,
      code: overrides?.code ?? `test-centre-${suffix}`,
      state: overrides?.state ?? "NSW",
      address: "123 Test Street",
      suburb: "Testville",
      postcode: "2000",
      status: overrides?.status ?? "active",
      capacity: overrides?.capacity ?? 60,
      operatingDays: "Mon,Tue,Wed,Thu,Fri",
      bscDailyRate: 25.0,
      ascDailyRate: 30.0,
      vcDailyRate: 65.0,
    },
  });
}
