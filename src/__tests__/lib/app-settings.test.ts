/**
 * Per-centre behaviour toggles.
 *
 * The defaults matter most: writing this field for the first time must
 * not change how any existing centre behaves.
 */
import { describe, it, expect } from "vitest";
import {
  appSettingsSchema,
  canPublishPosts,
  resolveAppSettings,
} from "@/lib/app-settings";

describe("resolveAppSettings", () => {
  it("defaults to what every centre does today", () => {
    const s = resolveAppSettings(null);
    expect(s.parents.canMarkAbsence).toBe(true);
    expect(s.posts.draftByDefault).toBe(false);
    expect(s.posts.onlyApproversPublish).toBe(false);
  });

  it("keeps defaults for the keys a centre hasn't set", () => {
    const s = resolveAppSettings({ posts: { draftByDefault: true } });
    expect(s.posts.draftByDefault).toBe(true);
    // Untouched, so still open.
    expect(s.parents.canMarkAbsence).toBe(true);
  });

  it("falls back to defaults on a corrupt value rather than throwing", () => {
    // A settings blob that fails to parse must not take the page down.
    const s = resolveAppSettings({ parents: "yes please" });
    expect(s.parents.canMarkAbsence).toBe(true);
  });

  it("respects an explicit false", () => {
    const s = resolveAppSettings({ parents: { canMarkAbsence: false } });
    expect(s.parents.canMarkAbsence).toBe(false);
  });
});

describe("canPublishPosts", () => {
  it("lets directors and the office publish when the restriction is off", () => {
    for (const role of ["member", "admin", "owner", "head_office"]) {
      expect(canPublishPosts(role, false)).toBe(true);
    }
  });

  it("never lets educators publish — their posts wait as drafts", () => {
    expect(canPublishPosts("staff", false)).toBe(false);
    expect(canPublishPosts("staff", true)).toBe(false);
  });

  it("restricts to admin and above when on", () => {
    expect(canPublishPosts("admin", true)).toBe(true);
    expect(canPublishPosts("owner", true)).toBe(true);
    expect(canPublishPosts("head_office", true)).toBe(true);
    // A coordinator can still WRITE — their post waits as a draft.
    expect(canPublishPosts("member", true)).toBe(false);
    expect(canPublishPosts("staff", true)).toBe(false);
  });
});

describe("sign in/out + staff settings (2026-10-08)", () => {
  it("default to today's behaviour: no signature, phone clock-in on", () => {
    const s = resolveAppSettings(undefined);
    expect(s.signInOut.requireSignature).toBe(false);
    expect(s.staff.phoneClockIn).toBe(true);
  });

  it("respects explicit values", () => {
    const s = resolveAppSettings({
      signInOut: { requireSignature: true },
      staff: { phoneClockIn: false },
    });
    expect(s.signInOut.requireSignature).toBe(true);
    expect(s.staff.phoneClockIn).toBe(false);
  });
});

describe("roster settings (Build Roster)", () => {
  it("defaults to no presets and no cost limit", () => {
    expect(resolveAppSettings(null).roster).toEqual({ shiftPresets: [], weeklyCostLimit: null });
  });

  it("keeps saved presets and limit", () => {
    const s = resolveAppSettings({ roster: { shiftPresets: [{ start: "14:30", end: "18:30" }], weeklyCostLimit: 4000 } });
    expect(s.roster.shiftPresets).toEqual([{ start: "14:30", end: "18:30" }]);
    expect(s.roster.weeklyCostLimit).toBe(4000);
  });

  it("rejects a malformed preset time", () => {
    const r = appSettingsSchema.safeParse({ roster: { shiftPresets: [{ start: "2:30pm", end: "18:30" }] } });
    expect(r.success).toBe(false);
  });
});
