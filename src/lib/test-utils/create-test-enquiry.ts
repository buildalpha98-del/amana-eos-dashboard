import { prisma } from "@/lib/prisma";
import type { ParentEnquiry } from "@prisma/client";

/**
 * Create a test parent enquiry with child details.
 */
export async function createTestEnquiry(
  serviceId: string,
  overrides?: Partial<
    Pick<ParentEnquiry, "parentName" | "parentEmail" | "parentPhone" | "channel" | "stage">
  >,
): Promise<ParentEnquiry> {
  const suffix = Math.random().toString(36).slice(2, 6);

  return prisma.parentEnquiry.create({
    data: {
      serviceId,
      parentName: overrides?.parentName ?? `Test Parent ${suffix}`,
      parentEmail: overrides?.parentEmail ?? `parent-${suffix}@test.local`,
      parentPhone: overrides?.parentPhone ?? "0400000000",
      childName: "Test Child",
      childAge: 8,
      childrenDetails: [
        { name: "Test Child 1", age: 8 },
        { name: "Test Child 2", age: 6 },
      ],
      channel: overrides?.channel ?? "phone",
      stage: overrides?.stage ?? "new_enquiry",
      parentDriver: "homework",
    },
  });
}
