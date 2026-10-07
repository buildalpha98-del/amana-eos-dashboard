import { describe, it, expect } from "vitest";
import { looksPersonal, suggestAssignee } from "@/lib/document-review";

const users = [
  { id: "u-akram", name: "Akram Haddad" },
  { id: "u-sarah1", name: "Sarah Ali" },
  { id: "u-sarah2", name: "Sarah Khan" },
  { id: "u-mirna", name: "Mirna Saad" },
];

describe("looksPersonal", () => {
  it.each([
    ["Akram contract", "akram-contract.pdf"],
    ["WWCC", "scan.jpg"],
    ["Payslip March", "x.pdf"],
    ["Tax file declaration", "tfn.pdf"],
  ])("flags %s", (title, fileName) => {
    expect(looksPersonal({ title, fileName, category: "other" })).toBe(true);
  });

  it("flags anything filed as HR", () => {
    expect(looksPersonal({ title: "Notes", fileName: "n.pdf", category: "hr" })).toBe(true);
  });

  it("leaves ordinary resources alone", () => {
    expect(looksPersonal({ title: "Sun Safety Policy", fileName: "sun.pdf", category: "policy" })).toBe(false);
  });
});

describe("suggestAssignee", () => {
  it("matches a first name that only one person has", () => {
    expect(suggestAssignee({ title: "Akram contract", fileName: "c.pdf" }, users)?.id).toBe("u-akram");
  });

  it("matches a full name even when the first name is shared", () => {
    expect(suggestAssignee({ title: "Contract", fileName: "sarah_khan_contract.pdf" }, users)?.id).toBe("u-sarah2");
  });

  it("refuses to guess between two people with the same first name", () => {
    expect(suggestAssignee({ title: "Sarah WWCC", fileName: "w.pdf" }, users)).toBeNull();
  });

  it("refuses to guess when two different people are named", () => {
    expect(suggestAssignee({ title: "Akram and Mirna roster", fileName: "r.pdf" }, users)).toBeNull();
  });

  it("does not match a name inside another word", () => {
    expect(suggestAssignee({ title: "Mirnas", fileName: "x.pdf" }, users)).toBeNull();
  });
});
