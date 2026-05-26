import { describe, it, expect } from "vitest";
import {
  toCustomTagKey,
  isCustomTagKey,
  CUSTOM_TAG_PREFIX,
} from "@/lib/contract-templates/custom-tag-key";

describe("toCustomTagKey", () => {
  it("camelCases multi-word labels and prefixes them with custom.", () => {
    expect(toCustomTagKey("Project Code")).toBe("custom.projectCode");
    expect(toCustomTagKey("client name")).toBe("custom.clientName");
    expect(toCustomTagKey("Tax ID")).toBe("custom.taxId");
  });

  it("lowercases single-word labels", () => {
    expect(toCustomTagKey("ABC")).toBe("custom.abc");
    expect(toCustomTagKey("Hello")).toBe("custom.hello");
  });

  it("trims leading/trailing whitespace", () => {
    expect(toCustomTagKey("  Project Code  ")).toBe("custom.projectCode");
  });

  it("treats punctuation, underscores, and hyphens as word separators", () => {
    expect(toCustomTagKey("hello_world")).toBe("custom.helloWorld");
    expect(toCustomTagKey("hello-world")).toBe("custom.helloWorld");
    expect(toCustomTagKey("hello.world")).toBe("custom.helloWorld");
    expect(toCustomTagKey("hello, world!")).toBe("custom.helloWorld");
  });

  it("collapses consecutive separators", () => {
    expect(toCustomTagKey("Hello    World")).toBe("custom.helloWorld");
    expect(toCustomTagKey("Hello---World")).toBe("custom.helloWorld");
  });

  it("preserves digits", () => {
    expect(toCustomTagKey("123 abc")).toBe("custom.123Abc");
    expect(toCustomTagKey("Step 2")).toBe("custom.step2");
  });

  it("returns empty string for inputs with no alphanumeric content", () => {
    expect(toCustomTagKey("")).toBe("");
    expect(toCustomTagKey("   ")).toBe("");
    expect(toCustomTagKey("!!!")).toBe("");
    expect(toCustomTagKey("---")).toBe("");
    expect(toCustomTagKey(".  _ ")).toBe("");
  });

  it("never produces a key that collides with system tag namespaces", () => {
    // Even when the user types "Staff First Name" it ends up scoped to
    // custom.* and won't clash with the hardcoded `staff.firstName` tag.
    expect(toCustomTagKey("Staff First Name")).toBe("custom.staffFirstName");
    // The dot in "contract.startDate" is treated as a separator, and the
    // whole input is lower-cased before camelCasing — so the user can't
    // accidentally collide with the hardcoded `contract.startDate` key
    // by re-typing it verbatim into the custom-tag input.
    expect(toCustomTagKey("contract.startDate")).toBe("custom.contractStartdate");
  });
});

describe("isCustomTagKey", () => {
  it("returns true for keys with custom. prefix and a name", () => {
    expect(isCustomTagKey("custom.projectCode")).toBe(true);
    expect(isCustomTagKey("custom.x")).toBe(true);
  });

  it("returns false for system tag keys", () => {
    expect(isCustomTagKey("staff.firstName")).toBe(false);
    expect(isCustomTagKey("today")).toBe(false);
    expect(isCustomTagKey("contract.startDate")).toBe(false);
  });

  it("returns false for the bare prefix without a name", () => {
    expect(isCustomTagKey("custom.")).toBe(false);
  });
});

describe("CUSTOM_TAG_PREFIX", () => {
  it("is the exact prefix string", () => {
    expect(CUSTOM_TAG_PREFIX).toBe("custom.");
  });
});
