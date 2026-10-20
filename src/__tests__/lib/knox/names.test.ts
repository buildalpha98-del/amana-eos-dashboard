import { describe, it, expect } from "vitest";
import { firstNameOf, nameTokensOf, otherNameTokensOf } from "@/lib/knox/names";

describe("firstNameOf", () => {
  it.each([
    ["Omar Hassan", "Omar"],
    ["Hassan, Omar", "Omar"],
    ["Hassan,Omar James", "Omar"],
    [" O'Neill ", "O'Neill"],
    ["  Mary-Jane  Smith ", "Mary-Jane"],
    ["(Ali) Haddad", "Ali"],
    ["", null],
    ["   ", null],
    ["Hassan,", null],
    [",,,", null],
  ])("%j → %j", (input, expected) => {
    expect(firstNameOf(input)).toBe(expected);
  });

  it("null / undefined → null", () => {
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
  });
});

describe("otherNameTokensOf (what the redactor scrubs)", () => {
  it("is the surname and middle names in either order, never the first name", () => {
    expect(otherNameTokensOf("Omar Hassan")).toEqual(["Hassan"]);
    expect(otherNameTokensOf("Hassan, Omar")).toEqual(["Hassan"]);
    expect(otherNameTokensOf("Ali Ibrahim Hassan")).toEqual(["Ibrahim", "Hassan"]);
    expect(otherNameTokensOf(" O'Neill ")).toEqual([]);
    expect(otherNameTokensOf("")).toEqual([]);
  });

  it("nameTokensOf trims punctuation from token edges", () => {
    expect(nameTokensOf("Hassan Ibrahim, Layla Noor.")).toEqual(["Hassan", "Ibrahim", "Layla", "Noor"]);
  });
});
