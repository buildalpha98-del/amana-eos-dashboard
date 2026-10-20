import { describe, it, expect } from "vitest";
import {
  fillChildName,
  followUpTodoLines,
  flaggedHeadline,
  formatCountdown,
  parseSubjectRef,
  ruleHitPhrase,
  subjectHref,
} from "@/lib/knox/format";

const NOW = Date.parse("2026-10-20T10:00:00Z");
const at = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString();

describe("formatCountdown", () => {
  it("counts down in hours and minutes", () => {
    expect(formatCountdown(at(3 * 60 + 12), NOW)).toEqual({ text: "due in 3h 12m", overdue: false });
  });
  it("shows minutes alone under an hour and days past a day", () => {
    expect(formatCountdown(at(45), NOW).text).toBe("due in 45m");
    expect(formatCountdown(at(26 * 60), NOW).text).toBe("due in 1d 2h");
  });
  it("reads OVERDUE once the due time has passed", () => {
    expect(formatCountdown(at(-40), NOW)).toEqual({ text: "OVERDUE by 40m", overdue: true });
  });
  it("trusts the stored overdue flag", () => {
    expect(formatCountdown(at(10), NOW, true).overdue).toBe(true);
  });
});

describe("fillChildName", () => {
  it("uses the first token of the child's name", () => {
    expect(fillChildName("Dear family of {{child_name}}, {{ child_name }} is fine.", "  Aisha  Rahman "))
      .toBe("Dear family of Aisha, Aisha is fine.");
  });
  it("leaves the placeholder when no name is known", () => {
    expect(fillChildName("Hi {{child_name}}", "Hassan, Omar")).toBe("Hi Omar");
    expect(fillChildName("Hi {{child_name}}", null)).toBe("Hi {{child_name}}");
    expect(fillChildName("Hi {{child_name}}", "  ")).toBe("Hi {{child_name}}");
  });
});

describe("rule wording", () => {
  it("maps rule ids to plain words", () => {
    expect(ruleHitPhrase("ambulance_called")).toBe("ambulance called");
    expect(ruleHitPhrase("some_new_rule")).toBe("some new rule");
    expect(flaggedHeadline(["ambulance_called", "medication_error"], "serious")).toBe(
      "Knox flagged: ambulance called; medication error",
    );
  });
});

describe("parseSubjectRef / subjectHref", () => {
  it("parses type:id and rejects junk", () => {
    expect(parseSubjectRef("complaint:c1")).toEqual({ type: "complaint", id: "c1" });
    expect(parseSubjectRef("staff_incident:s1")).toEqual({ type: "staff_incident", id: "s1" });
    expect(parseSubjectRef("nope:c1")).toBeNull();
    expect(parseSubjectRef("complaint:")).toBeNull();
    expect(parseSubjectRef(null)).toBeNull();
  });
  it("matches the deep links alerts.ts recordLink emits", () => {
    expect(subjectHref("incident", "i1", "a1")).toBe("/incidents?knox=a1&incident=i1");
    expect(subjectHref("complaint", "c1")).toBe("/knox?subject=complaint:c1");
    expect(subjectHref("staff_incident", "s1")).toBe("/knox?subject=staff_incident:s1");
  });
});

describe("followUpTodoLines", () => {
  it("lists each to-do with its due window, so the card shows what Approve creates", () => {
    expect(
      followUpTodoLines({
        todos: [
          { title: "Ring the family", dueInDays: 1 },
          { title: " Update the risk assessment ", dueInDays: 7 },
        ],
      }),
    ).toEqual(["Ring the family (due in 1 day)", "Update the risk assessment (due in 7 days)"]);
  });

  it("drops malformed entries and tolerates a missing or junk payload", () => {
    expect(followUpTodoLines({ todos: [null, { title: "" }, { title: "Check", dueInDays: "x" }, 4] })).toEqual(["Check"]);
    expect(followUpTodoLines({ items: [{ title: "x", dueInDays: 1 }] })).toEqual([]);
    expect(followUpTodoLines(null)).toEqual([]);
    expect(followUpTodoLines("nope")).toEqual([]);
  });
});
