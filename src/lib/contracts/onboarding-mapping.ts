import type { ContractType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Map contract type -> OnboardingPack name.
 * Names must match the canonical seed in src/app/api/onboarding/seed/route.ts.
 * Edit here when adding new pack types.
 */
export const CONTRACT_TYPE_TO_PACK_NAME: Record<ContractType, string> = {
  ct_casual: "Casual / Relief Educator Induction",
  ct_part_time: "New Educator Induction",
  ct_permanent: "New Educator Induction",
  ct_fixed_term: "New Educator Induction",
};

/**
 * Resolve the OnboardingPack to use for a given contract.
 * Lookup order:
 *   1. Pack matching CONTRACT_TYPE_TO_PACK_NAME[contractType]
 *   2. Default pack for the user's service (serviceId matches + isDefault=true)
 *   3. Global default pack (serviceId=null + isDefault=true)
 *   4. null -> caller logs warn; ack still succeeds
 */
export async function resolveOnboardingPackForContract(params: {
  contractType: ContractType;
  userServiceId: string | null;
}): Promise<{ id: string; name: string } | null> {
  const targetName = CONTRACT_TYPE_TO_PACK_NAME[params.contractType];

  if (targetName) {
    const byName = await prisma.onboardingPack.findFirst({
      where: { name: targetName, deleted: false },
      select: { id: true, name: true },
    });
    if (byName) return byName;
  }

  if (params.userServiceId) {
    const serviceDefault = await prisma.onboardingPack.findFirst({
      where: { serviceId: params.userServiceId, isDefault: true, deleted: false },
      select: { id: true, name: true },
    });
    if (serviceDefault) return serviceDefault;
  }

  const globalDefault = await prisma.onboardingPack.findFirst({
    where: { serviceId: null, isDefault: true, deleted: false },
    select: { id: true, name: true },
  });
  if (globalDefault) return globalDefault;

  return null;
}
