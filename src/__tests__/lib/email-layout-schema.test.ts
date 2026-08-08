import { describe, it, expect } from "vitest";
import {
  layoutOptionsSchema,
  LAYOUT_OPTION_KEYS,
  pickTouchedLayoutOptions,
  resolveTouchedLayoutKeys,
} from "@/lib/email-layout-schema";

const BLOB_URL =
  "https://abc123.public.blob.vercel-storage.com/logos/amana-logo.png";

describe("layoutOptionsSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(layoutOptionsSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a fully-populated valid payload", () => {
    const result = layoutOptionsSchema.safeParse({
      headerColor: "#112233",
      headerText: "Bright Futures OSHC",
      headerLogoUrl: BLOB_URL,
      footerText: "Bright Futures OSHC",
      footerUrl: "https://brightfutures.example.com",
      footerUrlLabel: "brightfutures.example.com",
      showUnsubscribe: false,
    });
    expect(result.success).toBe(true);
  });

  describe("headerColor", () => {
    it("rejects a non-hex colour name", () => {
      expect(
        layoutOptionsSchema.safeParse({ headerColor: "red" }).success,
      ).toBe(false);
    });

    it("rejects a truncated hex value", () => {
      expect(
        layoutOptionsSchema.safeParse({ headerColor: "#12345" }).success,
      ).toBe(false);
    });

    it("rejects non-hex characters", () => {
      expect(
        layoutOptionsSchema.safeParse({ headerColor: "#GGGGGG" }).success,
      ).toBe(false);
    });

    it("rejects a style-breakout attempt in the colour slot", () => {
      expect(
        layoutOptionsSchema.safeParse({
          headerColor: '#004E64;background:url("x")',
        }).success,
      ).toBe(false);
    });

    it("accepts a valid 6-digit hex (either case)", () => {
      expect(
        layoutOptionsSchema.safeParse({ headerColor: "#004e64" }).success,
      ).toBe(true);
      expect(
        layoutOptionsSchema.safeParse({ headerColor: "#004E64" }).success,
      ).toBe(true);
    });
  });

  describe("text length limits", () => {
    it("rejects headerText over 120 chars and accepts 120", () => {
      expect(
        layoutOptionsSchema.safeParse({ headerText: "a".repeat(121) }).success,
      ).toBe(false);
      expect(
        layoutOptionsSchema.safeParse({ headerText: "a".repeat(120) }).success,
      ).toBe(true);
    });

    it("rejects footerText over 200 chars and accepts 200", () => {
      expect(
        layoutOptionsSchema.safeParse({ footerText: "a".repeat(201) }).success,
      ).toBe(false);
      expect(
        layoutOptionsSchema.safeParse({ footerText: "a".repeat(200) }).success,
      ).toBe(true);
    });

    it("rejects footerUrlLabel over 120 chars and accepts 120", () => {
      expect(
        layoutOptionsSchema.safeParse({ footerUrlLabel: "a".repeat(121) })
          .success,
      ).toBe(false);
      expect(
        layoutOptionsSchema.safeParse({ footerUrlLabel: "a".repeat(120) })
          .success,
      ).toBe(true);
    });
  });

  describe("headerLogoUrl", () => {
    it("rejects an off-host logo URL", () => {
      expect(
        layoutOptionsSchema.safeParse({
          headerLogoUrl: "https://evil.example.com/logo.png",
        }).success,
      ).toBe(false);
    });

    it("rejects an http (non-https) Blob-host URL", () => {
      expect(
        layoutOptionsSchema.safeParse({
          headerLogoUrl:
            "http://abc123.public.blob.vercel-storage.com/logo.png",
        }).success,
      ).toBe(false);
    });

    it("allows the empty string (means: no logo, use header text)", () => {
      expect(
        layoutOptionsSchema.safeParse({ headerLogoUrl: "" }).success,
      ).toBe(true);
    });

    it("accepts a trusted Blob-host URL", () => {
      expect(
        layoutOptionsSchema.safeParse({ headerLogoUrl: BLOB_URL }).success,
      ).toBe(true);
    });
  });

  describe("footerUrl", () => {
    it("rejects an http URL", () => {
      expect(
        layoutOptionsSchema.safeParse({ footerUrl: "http://example.com" })
          .success,
      ).toBe(false);
    });

    it("rejects a javascript: URL", () => {
      expect(
        layoutOptionsSchema.safeParse({ footerUrl: "javascript:alert(1)" })
          .success,
      ).toBe(false);
    });

    it("rejects a non-URL string", () => {
      expect(
        layoutOptionsSchema.safeParse({ footerUrl: "not a url" }).success,
      ).toBe(false);
    });

    it("accepts an https URL on any host (it's a link, not an embed)", () => {
      expect(
        layoutOptionsSchema.safeParse({ footerUrl: "https://example.com/about" })
          .success,
      ).toBe(true);
    });
  });

  describe("strictness", () => {
    it("rejects unknown keys", () => {
      expect(
        layoutOptionsSchema.safeParse({ headerText: "ok", sneaky: "nope" })
          .success,
      ).toBe(false);
    });

    it("rejects a non-boolean showUnsubscribe", () => {
      expect(
        layoutOptionsSchema.safeParse({ showUnsubscribe: "yes" }).success,
      ).toBe(false);
    });
  });
});

describe("pickTouchedLayoutOptions", () => {
  const options = {
    headerColor: "#004E64",
    headerText: "Seeded Name",
    headerLogoUrl: "",
    footerText: "Seeded Name",
    footerUrl: "https://amanaoshc.com.au",
    footerUrlLabel: "amanaoshc.com.au",
    showUnsubscribe: true,
  };

  it("emits ONLY the touched keys — untouched fields never ship (branding-shadowing pin)", () => {
    expect(pickTouchedLayoutOptions(options, ["footerText"])).toEqual({
      footerText: "Seeded Name",
    });
  });

  it("returns an empty object when nothing is touched", () => {
    expect(pickTouchedLayoutOptions(options, [])).toEqual({});
  });

  it("drops unknown touched keys (stale/junk draft entries can't 400 the strict schema)", () => {
    expect(
      pickTouchedLayoutOptions(options, ["sneaky", "headerColor"]),
    ).toEqual({ headerColor: "#004E64" });
  });

  it("skips touched keys whose value is undefined", () => {
    expect(
      pickTouchedLayoutOptions({ headerText: undefined }, ["headerText"]),
    ).toEqual({});
  });

  it("a fully-touched panel emits every field", () => {
    expect(
      pickTouchedLayoutOptions(options, [...LAYOUT_OPTION_KEYS]),
    ).toEqual(options);
  });

  it("its output always passes the strict schema", () => {
    const picked = pickTouchedLayoutOptions(options, [
      "headerColor",
      "showUnsubscribe",
      "junk",
    ]);
    expect(layoutOptionsSchema.safeParse(picked).success).toBe(true);
  });
});

describe("resolveTouchedLayoutKeys (draft restore)", () => {
  it("returns the stored keys, filtered to known layout fields", () => {
    expect(
      resolveTouchedLayoutKeys({
        touchedLayoutKeys: ["headerText", "junk", 42],
      }),
    ).toEqual(["headerText"]);
  });

  it("legacy dirty draft (pre-touched-keys) conservatively restores ALL keys", () => {
    expect(resolveTouchedLayoutKeys({ layoutDirty: true })).toEqual([
      ...LAYOUT_OPTION_KEYS,
    ]);
  });

  it("legacy clean draft restores no touched keys", () => {
    expect(resolveTouchedLayoutKeys({ layoutDirty: false })).toEqual([]);
  });

  it("an empty/absent draft restores no touched keys", () => {
    expect(resolveTouchedLayoutKeys({})).toEqual([]);
  });
});
