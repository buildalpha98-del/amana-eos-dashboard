import { describe, it, expect } from "vitest";
import { childIsAlHafiz, offersAlHafiz } from "@/lib/al-hafiz";
import { websiteEnrolContext } from "@/lib/website-enrol-context";

describe("Al Hafiz tag", () => {
  it("only applies at MFIS Greenacre", () => {
    expect(offersAlHafiz("Malek Fahd Greenacre")).toBe(true);
    expect(offersAlHafiz("Malek Fahd Hoxton Park")).toBe(false);
    expect(childIsAlHafiz({ alHafiz: true, schoolName: "Malek Fahd Greenacre" })).toBe(true);
    // Ticked, then the family changed school — not Al Hafiz.
    expect(childIsAlHafiz({ alHafiz: true, schoolName: "Unity Grammar" })).toBe(false);
    expect(childIsAlHafiz({ schoolName: "Malek Fahd Greenacre" })).toBe(false);
  });

  it("the website link carries program=al-hafiz only with MFIS Greenacre", () => {
    const ok = websiteEnrolContext(new URLSearchParams("centre=mfis-greenacre&program=al-hafiz"));
    expect(ok.get("program")).toBe("al-hafiz");
    const wrong = websiteEnrolContext(new URLSearchParams("centre=unity-grammar&program=al-hafiz"));
    expect(wrong.get("program")).toBeNull();
    const junk = websiteEnrolContext(new URLSearchParams("program=<script>"));
    expect(junk.toString()).toBe("");
  });
});
