/**
 * Tests for contract term extraction.
 *
 * The model call is mocked throughout — what's under test is the layer
 * around it, which is where a wrong pay rate would actually come from:
 * the annual/weekly → hourly derivation, the plausibility band, and the
 * refusal to guess when the document has no text.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const generateStructured = vi.fn();
const extractText = vi.fn();
const extractTextFromBuffer = vi.fn();

vi.mock("@/lib/ai-provider", () => ({
  generateStructured: (...args: unknown[]) => generateStructured(...args),
}));

vi.mock("@/lib/document-indexer", () => ({
  extractText: (...args: unknown[]) => extractText(...args),
  extractTextFromBuffer: (...args: unknown[]) => extractTextFromBuffer(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { extractContractTerms } from "@/lib/contracts/extract-terms";

const LONG_TEXT = "Employment contract. ".repeat(50);

function modelReturns(data: Record<string, unknown>) {
  generateStructured.mockResolvedValue({ data });
}

describe("extractContractTerms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extractText.mockResolvedValue(LONG_TEXT);
    extractTextFromBuffer.mockResolvedValue(LONG_TEXT);
  });

  it("passes an hourly rate straight through, underived", async () => {
    modelReturns({
      payRate: 38.5,
      payRateBasis: "hourly",
      payRateQuote: "The hourly rate is $38.50.",
      confidence: "high",
    });

    const terms = await extractContractTerms({
      fileUrl: "https://blob.example.com/c.pdf",
      mimeType: "application/pdf",
    });

    expect(terms.payRate).toBe(38.5);
    expect(terms.payRateDerived).toBe(false);
    expect(terms.confidence).toBe("high");
  });

  it("derives an hourly rate from an annual salary using the stated hours", async () => {
    modelReturns({
      payRate: 80000,
      payRateBasis: "annual",
      hoursPerWeek: 38,
      confidence: "high",
    });

    const terms = await extractContractTerms({
      fileUrl: "https://blob.example.com/c.pdf",
      mimeType: "application/pdf",
    });

    // 80000 / 52.1786 / 38
    expect(terms.payRate).toBeCloseTo(40.34, 1);
    expect(terms.payRateDerived).toBe(true);
  });

  it("never reports high confidence for a derived rate", async () => {
    modelReturns({
      payRate: 1500,
      payRateBasis: "weekly",
      hoursPerWeek: 38,
      confidence: "high",
    });

    const terms = await extractContractTerms({
      fileUrl: "https://blob.example.com/c.pdf",
      mimeType: "application/pdf",
    });

    // The derivation rests on our divisor, not on the document, so the
    // model's own certainty about the weekly figure doesn't carry over.
    expect(terms.payRateDerived).toBe(true);
    expect(terms.confidence).toBe("medium");
  });

  it("drops an implausibly low rate rather than suggesting it", async () => {
    // A superannuation percentage or an allowance misread as the base rate.
    modelReturns({ payRate: 0.12, payRateBasis: "hourly", confidence: "low" });

    const terms = await extractContractTerms({
      fileUrl: "https://blob.example.com/c.pdf",
      mimeType: "application/pdf",
    });

    expect(terms.payRate).toBeNull();
  });

  it("drops an implausibly high rate rather than suggesting it", async () => {
    // An annual salary the model failed to label as annual.
    modelReturns({ payRate: 95000, payRateBasis: "hourly", confidence: "high" });

    const terms = await extractContractTerms({
      fileUrl: "https://blob.example.com/c.pdf",
      mimeType: "application/pdf",
    });

    expect(terms.payRate).toBeNull();
  });

  it("returns nulls without calling the model when the document has no text", async () => {
    extractText.mockResolvedValue("   ");

    const terms = await extractContractTerms({
      fileUrl: "https://blob.example.com/scan.pdf",
      mimeType: "application/pdf",
    });

    expect(generateStructured).not.toHaveBeenCalled();
    expect(terms.payRate).toBeNull();
    expect(terms.confidence).toBe("low");
    expect(terms.notes).toMatch(/scan|image/i);
  });

  it("reads from the buffer when one is supplied, without fetching a URL", async () => {
    modelReturns({ payRate: 32, payRateBasis: "hourly", confidence: "high" });

    await extractContractTerms({
      buffer: Buffer.from("x"),
      mimeType: "application/pdf",
    });

    expect(extractTextFromBuffer).toHaveBeenCalled();
    expect(extractText).not.toHaveBeenCalled();
  });

  it("ignores a malformed date rather than passing it on", async () => {
    modelReturns({
      payRate: 32,
      payRateBasis: "hourly",
      startDate: "first Monday of March",
      endDate: "2026-03-01",
      confidence: "high",
    });

    const terms = await extractContractTerms({
      buffer: Buffer.from("x"),
      mimeType: "application/pdf",
    });

    expect(terms.startDate).toBeNull();
    expect(terms.endDate).toBe("2026-03-01");
  });

  it("wraps the contract text in a data tag so it reads as data, not instructions", async () => {
    modelReturns({ payRate: 32, payRateBasis: "hourly", confidence: "high" });

    await extractContractTerms({
      buffer: Buffer.from("x"),
      mimeType: "application/pdf",
    });

    const opts = generateStructured.mock.calls[0][0];
    expect(opts.prompt).toContain("<contract_text>");
    expect(opts.system).toMatch(/ignore them/i);
    // Deterministic — the same contract should read the same way twice.
    expect(opts.temperature).toBe(0);
  });
});
