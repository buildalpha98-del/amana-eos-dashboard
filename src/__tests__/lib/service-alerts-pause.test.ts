import { describe, it, expect, beforeEach, vi } from "vitest";

const getOrgSettings = vi.fn();
vi.mock("@/lib/org-settings", () => ({
  getOrgSettings: () => getOrgSettings(),
}));

import {
  isServiceAlertsPaused,
  skipIfServiceAlertsPaused,
  SERVICE_ALERTS_PAUSED_REASON,
} from "@/lib/service-alerts-pause";

describe("service-alerts-pause", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the org-settings flag", async () => {
    getOrgSettings.mockResolvedValue({ notifications: { serviceAlertsPaused: true } });
    expect(await isServiceAlertsPaused()).toBe(true);
    getOrgSettings.mockResolvedValue({ notifications: { serviceAlertsPaused: false } });
    expect(await isServiceAlertsPaused()).toBe(false);
  });

  it("returns null and leaves the guard alone when NOT paused", async () => {
    getOrgSettings.mockResolvedValue({ notifications: { serviceAlertsPaused: false } });
    const guard = { complete: vi.fn() };
    expect(await skipIfServiceAlertsPaused(guard)).toBeNull();
    expect(guard.complete).not.toHaveBeenCalled();
  });

  it("completes the lock with a paused marker and returns a skipped response when paused", async () => {
    getOrgSettings.mockResolvedValue({ notifications: { serviceAlertsPaused: true } });
    const guard = { complete: vi.fn().mockResolvedValue(undefined) };
    const res = await skipIfServiceAlertsPaused(guard);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body).toMatchObject({ skipped: true, reason: SERVICE_ALERTS_PAUSED_REASON });
    expect(guard.complete).toHaveBeenCalledWith({
      skipped: true,
      reason: SERVICE_ALERTS_PAUSED_REASON,
    });
  });
});
