/**
 * Per-centre behaviour toggles.
 *
 * The defaults matter most: writing this field for the first time must
 * not change how any existing centre behaves.
 */
import { describe, it, expect } from "vitest";
import {
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
  it("lets everyone publish when the restriction is off", () => {
    for (const role of ["member", "staff", "admin"]) {
      expect(canPublishPosts(role, false)).toBe(true);
    }
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
