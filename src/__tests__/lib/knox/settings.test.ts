import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  mergeOrgSettings,
  ORG_SETTINGS_DEFAULTS,
  orgSettingsConfigSchema,
} from "@/lib/org-settings-shared";

const getOrgSettingsMock = vi.fn();
vi.mock("@/lib/org-settings", () => ({
  getOrgSettings: () => getOrgSettingsMock(),
}));

import { getKnoxSettings } from "@/lib/knox/settings";

describe("Knox org settings", () => {
  beforeEach(() => {
    getOrgSettingsMock.mockReset();
  });

  it("defaults knox to off + shadow", () => {
    expect(ORG_SETTINGS_DEFAULTS.knox).toEqual({ enabled: false, shadowMode: true });
  });

  it("merge keeps stored knox values and fills missing ones", () => {
    const merged = mergeOrgSettings({ knox: { enabled: true } } as never);
    expect(merged.knox).toEqual({ enabled: true, shadowMode: true });
  });

  it("merge falls back to defaults when the knox key is absent or malformed", () => {
    expect(mergeOrgSettings({} as never).knox).toEqual({ enabled: false, shadowMode: true });
    expect(
      mergeOrgSettings({ knox: { enabled: "yes", shadowMode: 0 } } as never).knox,
    ).toEqual({ enabled: false, shadowMode: true });
  });

  it("schema accepts a full knox object and rejects a non-boolean", () => {
    expect(
      orgSettingsConfigSchema.shape.knox.safeParse({ enabled: true, shadowMode: false }).success,
    ).toBe(true);
    expect(orgSettingsConfigSchema.shape.knox.safeParse({ enabled: "yes" }).success).toBe(false);
  });

  it("getKnoxSettings returns the knox slice of the merged org settings", async () => {
    getOrgSettingsMock.mockResolvedValue({
      ...ORG_SETTINGS_DEFAULTS,
      knox: { enabled: true, shadowMode: false },
    });
    await expect(getKnoxSettings()).resolves.toEqual({ enabled: true, shadowMode: false });
  });
});
