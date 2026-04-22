import { describe, it, expect } from "vitest";
import {
  buildScreenPrompt,
  parseScreenResponse,
} from "@/lib/recruitment/ai-screen-prompt";

describe("buildScreenPrompt", () => {
  it("interpolates all fields", () => {
    const prompt = buildScreenPrompt({
      candidateName: "Amira",
      candidateEmail: "a@t.com",
      candidatePhone: null,
      resumeText: "Cert III, 2 years at OSHC X",
      vacancyRole: "educator",
      employmentType: "part_time",
      qualificationRequired: "cert_iii",
    });
    expect(prompt).toContain("Amira");
    expect(prompt).toContain("a@t.com");
    expect(prompt).toContain("(not provided)"); // phone null
    expect(prompt).toContain("Cert III, 2 years at OSHC X");
    expect(prompt).toContain("Role: educator");
    expect(prompt).toContain("Qualification Required: cert_iii");
  });

  it("uses fallback when resumeText is empty", () => {
    const prompt = buildScreenPrompt({
      candidateName: "X",
      resumeText: "",
      vacancyRole: "educator",
      employmentType: "permanent",
    });
    expect(prompt).toContain("(no resume text provided)");
  });
});

describe("parseScreenResponse", () => {
  it("parses raw JSON", () => {
    const result = parseScreenResponse(
      '{"score": 78, "summary": "Strong experience."}',
    );
    expect(result).toEqual({ score: 78, summary: "Strong experience." });
  });

  it("strips ```json fences", () => {
    const result = parseScreenResponse(
      '```json\n{"score": 50, "summary": "OK match."}\n```',
    );
    expect(result).toEqual({ score: 50, summary: "OK match." });
  });

  it("strips plain ``` fences", () => {
    const result = parseScreenResponse(
      '```\n{"score": 20, "summary": "Poor."}\n```',
    );
    expect(result).toEqual({ score: 20, summary: "Poor." });
  });

  it("rounds non-integer scores", () => {
    expect(
      parseScreenResponse('{"score": 78.6, "summary": "Close."}').score,
    ).toBe(79);
  });

  it("throws on score > 100", () => {
    expect(() =>
      parseScreenResponse('{"score": 101, "summary": "x"}'),
    ).toThrow(/invalid score/);
  });

  it("throws on score < 0", () => {
    expect(() =>
      parseScreenResponse('{"score": -1, "summary": "x"}'),
    ).toThrow(/invalid score/);
  });

  it("throws on non-numeric score", () => {
    expect(() =>
      parseScreenResponse('{"score": "high", "summary": "x"}'),
    ).toThrow(/invalid score/);
  });

  it("throws on empty summary", () => {
    expect(() =>
      parseScreenResponse('{"score": 50, "summary": ""}'),
    ).toThrow(/empty summary/);
  });

  it("throws friendly error when AI returns malformed JSON", () => {
    expect(() => parseScreenResponse("not json at all")).toThrow(
      /malformed response/,
    );
  });

  it("throws friendly error when fenced content is malformed", () => {
    expect(() =>
      parseScreenResponse('```json\n{ bad: "shape" }\n```'),
    ).toThrow(/malformed response/);
  });
});
