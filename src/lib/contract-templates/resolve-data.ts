import type { ContractType, AwardLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MERGE_TAGS_BY_KEY } from "./merge-tag-catalog";
import { DEFAULT_ENTITY_NAME } from "./constants";
import { CONTRACT_TYPE_LABELS, getAwardLabel } from "@/components/contracts/constants";

export type ContractMetaInput = {
  contractType: ContractType;
  awardLevel?: AwardLevel | null;
  awardLevelCustom?: string | null;
  payRate: number;
  hoursPerWeek?: number | null;
  startDate: Date;
  endDate?: Date | null;
  position: string;
};

function friendlyDate(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

export async function resolveTemplateData(args: {
  userId: string;
  contractMeta: ContractMetaInput;
}): Promise<{ resolved: Record<string, string>; missingBlocking: string[] }> {
  const { userId, contractMeta } = args;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { service: { include: { manager: true } } },
  });

  const resolved: Record<string, string> = {};
  const missingBlocking: string[] = [];

  function set(key: string, value: string | null | undefined) {
    const val = value ?? "";
    resolved[key] = val;
    if (!val && MERGE_TAGS_BY_KEY[key]?.blocking) {
      missingBlocking.push(key);
    }
  }

  // ── Staff ─────────────────────────────────────────
  const fullName = user?.name ?? "";
  const spaceIdx = fullName.indexOf(" ");
  const firstName = spaceIdx >= 0 ? fullName.slice(0, spaceIdx) : fullName;
  const lastName = spaceIdx >= 0 ? fullName.slice(spaceIdx + 1) : "";

  set("staff.firstName", firstName);
  set("staff.lastName", lastName);
  set("staff.fullName", fullName);
  set("staff.email", user?.email);
  set("staff.phone", user?.phone);
  set("staff.address", user?.addressStreet);
  set("staff.city", user?.addressSuburb);
  set("staff.state", user?.addressState);
  set("staff.postcode", user?.addressPostcode);

  // ── Service ───────────────────────────────────────
  const svc = user?.service ?? null;
  set("service.name", svc?.name);

  const svcAddressParts = [svc?.address, svc?.suburb, svc?.state, svc?.postcode].filter(Boolean);
  set("service.address", svcAddressParts.join(", ") || null);

  // Hard-coded — Service model has no entityName column.
  set("service.entityName", DEFAULT_ENTITY_NAME);

  // ── Manager ───────────────────────────────────────
  const mgr = svc?.manager ?? null;
  const mgrName = mgr?.name ?? "";
  const mgrSpaceIdx = mgrName.indexOf(" ");
  const mgrFirst = mgrSpaceIdx >= 0 ? mgrName.slice(0, mgrSpaceIdx) : mgrName;
  const mgrLast = mgrSpaceIdx >= 0 ? mgrName.slice(mgrSpaceIdx + 1) : "";

  // Manager fields are all blocking=false — resolve to empty string without adding to missingBlocking.
  resolved["manager.firstName"] = mgrFirst;
  resolved["manager.lastName"] = mgrLast;
  resolved["manager.fullName"] = mgrName;
  // Hard-coded — User model has no title column (intentional pending User.title field).
  resolved["manager.title"] = mgr ? "Director" : "";

  // ── Contract ──────────────────────────────────────
  set("contract.startDate", friendlyDate(contractMeta.startDate));
  set("contract.endDate", contractMeta.endDate ? friendlyDate(contractMeta.endDate) : "");
  set("contract.payRate", "$" + contractMeta.payRate.toFixed(2));
  set("contract.hoursPerWeek", contractMeta.hoursPerWeek != null ? String(contractMeta.hoursPerWeek) : "");
  set("contract.position", contractMeta.position);
  set("contract.contractType", CONTRACT_TYPE_LABELS[contractMeta.contractType] ?? contractMeta.contractType);
  set("contract.awardLevel", getAwardLabel(contractMeta.awardLevel ?? null, contractMeta.awardLevelCustom ?? null));

  // ── System ────────────────────────────────────────
  resolved["today"] = new Date().toLocaleDateString("en-AU");
  resolved["letterDate"] = friendlyDate(new Date());

  return { resolved, missingBlocking };
}
