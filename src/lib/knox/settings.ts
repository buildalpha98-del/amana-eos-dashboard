import { getOrgSettings } from "@/lib/org-settings";

export interface KnoxSettings {
  enabled: boolean;
  shadowMode: boolean;
}

/** Runtime toggles for the Knox incident-triage agent (org settings → knox). */
export async function getKnoxSettings(): Promise<KnoxSettings> {
  return (await getOrgSettings()).knox;
}
