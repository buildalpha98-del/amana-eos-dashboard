export type MergeTagGroup = "staff" | "service" | "contract" | "manager" | "system";
export type MergeTagDef = { key: string; label: string; group: MergeTagGroup; blocking: boolean };
export const MERGE_TAGS: MergeTagDef[] = [
  // Staff (blocking: true)
  { key: "staff.firstName", label: "Staff: First name", group: "staff", blocking: true },
  { key: "staff.lastName", label: "Staff: Last name", group: "staff", blocking: true },
  { key: "staff.fullName", label: "Staff: Full name", group: "staff", blocking: true },
  { key: "staff.email", label: "Staff: Email", group: "staff", blocking: true },
  { key: "staff.phone", label: "Staff: Phone", group: "staff", blocking: false },
  { key: "staff.address", label: "Staff: Street address", group: "staff", blocking: true },
  { key: "staff.city", label: "Staff: City/Suburb", group: "staff", blocking: true },
  { key: "staff.state", label: "Staff: State", group: "staff", blocking: true },
  { key: "staff.postcode", label: "Staff: Postcode", group: "staff", blocking: true },
  // Service
  { key: "service.name", label: "Service: Name", group: "service", blocking: true },
  { key: "service.address", label: "Service: Address", group: "service", blocking: false },
  { key: "service.entityName", label: "Service: Legal entity", group: "service", blocking: false },
  // Contract
  { key: "contract.startDate", label: "Contract: Start date", group: "contract", blocking: true },
  { key: "contract.endDate", label: "Contract: End date", group: "contract", blocking: false },
  { key: "contract.payRate", label: "Contract: Pay rate", group: "contract", blocking: true },
  { key: "contract.hoursPerWeek", label: "Contract: Hours per week", group: "contract", blocking: false },
  { key: "contract.position", label: "Contract: Position", group: "contract", blocking: true },
  { key: "contract.contractType", label: "Contract: Type", group: "contract", blocking: true },
  { key: "contract.awardLevel", label: "Contract: Award level", group: "contract", blocking: false },
  // Manager
  { key: "manager.firstName", label: "Manager: First name", group: "manager", blocking: false },
  { key: "manager.lastName", label: "Manager: Last name", group: "manager", blocking: false },
  { key: "manager.fullName", label: "Manager: Full name", group: "manager", blocking: false },
  { key: "manager.title", label: "Manager: Title", group: "manager", blocking: false },
  // System
  { key: "today", label: "System: Today's date", group: "system", blocking: false },
  { key: "letterDate", label: "System: Letter date (long format)", group: "system", blocking: false },
];
export const MERGE_TAGS_BY_KEY: Record<string, MergeTagDef> = Object.fromEntries(MERGE_TAGS.map((t) => [t.key, t]));
