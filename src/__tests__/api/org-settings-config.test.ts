import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

// ── Standard mock preamble ──────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

import { GET as getConfig } from "@/app/api/org-settings/config/route";
import { _clearOrgSettingsCache } from "@/lib/org-settings";
import { _clearEmailBrandingCache } from "@/lib/email-branding";

function setupActiveUserMock() {
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findUnique.mockImplementation(
    async (args: { where?: { id?: string } } | undefined) => {
      if (args?.where?.id === "user-1") {
        return { active: true, id: "user-1", role: "marketing" } as never;
      }
      return null;
    },
  );
}

describe("GET /api/org-settings/config — branding slice for the composer seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    _clearOrgSettingsCache();
    _clearEmailBrandingCache();
    setupActiveUserMock();
    // Deliberately a MARKETING session — this GET must stay open to any
    // authed user (the row-level /api/org-settings GET is role-gated, which
    // is exactly why the composer seeds from here).
    mockSession({ id: "user-1", name: "Marketer", role: "marketing" });
    // Both getOrgSettings (select {config}) and getEmailBranding
    // (select {name, primaryColor}) hit orgSettings.findUnique — route by
    // the select shape.
    prismaMock.orgSettings.findUnique.mockImplementation(
      async (args: { select?: Record<string, boolean> } | undefined) => {
        if (args?.select?.config) return { config: {} } as never;
        return { name: "Bright Futures OSHC", primaryColor: "#112233" } as never;
      },
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await getConfig(
      createRequest("GET", "/api/org-settings/config"),
    );
    expect(res.status).toBe(401);
  });

  it("returns the branding slice from the same org-settings fields the send routes use", async () => {
    const res = await getConfig(
      createRequest("GET", "/api/org-settings/config"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.config).toBeDefined();
    expect(json.branding).toEqual({
      name: "Bright Futures OSHC",
      primaryColor: "#112233",
      websiteUrl: "https://amanaoshc.com.au",
      websiteUrlLabel: "amanaoshc.com.au",
    });
  });

  it("falls back to branding defaults when no org-settings row exists", async () => {
    prismaMock.orgSettings.findUnique.mockResolvedValue(null);

    const res = await getConfig(
      createRequest("GET", "/api/org-settings/config"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.branding).toEqual({
      name: "Amana OSHC",
      primaryColor: "#004E64",
      websiteUrl: "https://amanaoshc.com.au",
      websiteUrlLabel: "amanaoshc.com.au",
    });
  });
});

describe("GET /api/org-settings/config — compliance.requiredCertsByRole slice (Phase 9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    _clearOrgSettingsCache();
    _clearEmailBrandingCache();
    setupActiveUserMock();
    // Deliberately a NON-admin session: staff surfaces (/compliance,
    // /my-portal) resolve required cert types from THIS slice because the
    // row-level /api/org-settings GET is role-gated away from them.
    mockSession({ id: "user-1", name: "Marketer", role: "marketing" });
  });

  it("exposes the default matrix when the stored config has no compliance block", async () => {
    prismaMock.orgSettings.findUnique.mockImplementation(
      async (args: { select?: Record<string, boolean> } | undefined) => {
        if (args?.select?.config) return { config: {} } as never;
        return { name: "Bright Futures OSHC", primaryColor: "#112233" } as never;
      },
    );
    const res = await getConfig(
      createRequest("GET", "/api/org-settings/config"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.config.compliance.requiredCertsByRole.staff).toEqual([
      "wwcc",
      "first_aid",
      "cpr",
      "anaphylaxis",
      "child_protection",
    ]);
    expect(json.config.compliance.requiredCertsByRole.owner).toEqual([]);
  });

  it("exposes a customised stored matrix", async () => {
    prismaMock.orgSettings.findUnique.mockImplementation(
      async (args: { select?: Record<string, boolean> } | undefined) => {
        if (args?.select?.config) {
          return {
            config: {
              compliance: {
                requiredCertsByRole: { staff: ["wwcc", "asthma"], member: [] },
              },
            },
          } as never;
        }
        return { name: "Bright Futures OSHC", primaryColor: "#112233" } as never;
      },
    );
    const res = await getConfig(
      createRequest("GET", "/api/org-settings/config"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.config.compliance.requiredCertsByRole.staff).toEqual([
      "wwcc",
      "asthma",
    ]);
    // Explicitly empty stays empty (empty ≠ missing).
    expect(json.config.compliance.requiredCertsByRole.member).toEqual([]);
  });
});

// ── PATCH role gate (2026-09-05: head_office added per Jayden) ─────
import { PATCH as patchConfig } from "@/app/api/org-settings/config/route";
import { ORG_SETTINGS_DEFAULTS } from "@/lib/org-settings-shared";

describe("PATCH /api/org-settings/config — role gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    _clearOrgSettingsCache();
    _clearEmailBrandingCache();
    prismaMock.user.findUnique.mockResolvedValue({
      active: true,
      id: "user-1",
      role: "head_office",
    } as never);
    prismaMock.orgSettings.upsert.mockResolvedValue({} as never);
    prismaMock.orgSettings.findUnique.mockResolvedValue({ config: {} } as never);
    prismaMock.activityLog.create.mockResolvedValue({} as never);
  });

  it("allows head_office to save org settings", async () => {
    mockSession({ id: "user-1", name: "State Manager", role: "head_office" });
    const res = await patchConfig(
      createRequest("PATCH", "/api/org-settings/config", {
        body: { config: ORG_SETTINGS_DEFAULTS },
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.orgSettings.upsert).toHaveBeenCalled();
  });

  it("still rejects marketing with 403", async () => {
    mockSession({ id: "user-1", name: "Marketer", role: "marketing" });
    const res = await patchConfig(
      createRequest("PATCH", "/api/org-settings/config", {
        body: { config: ORG_SETTINGS_DEFAULTS },
      }),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.orgSettings.upsert).not.toHaveBeenCalled();
  });
});
