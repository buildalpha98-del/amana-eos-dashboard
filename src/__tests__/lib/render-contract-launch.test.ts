/**
 * Pins the assumption behind the accepted puppeteer advisories
 * (security/advisory-exceptions.json): contract PDFs always launch the
 * bundled @sparticuz/chromium executable, so @puppeteer/browsers' download
 * and unzip code — where the advisories live — is never reached.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const launch = vi.hoisted(() =>
  vi.fn(async () => ({
    connected: true,
    newPage: async () => ({
      setContent: vi.fn(async () => {}),
      evaluate: vi.fn(async () => undefined),
      pdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
      close: vi.fn(async () => {}),
    }),
  })),
);
vi.mock("puppeteer-core", () => ({ default: { launch } }));
vi.mock("@sparticuz/chromium", () => ({
  default: { args: ["--synthetic"], executablePath: vi.fn(async () => "/tmp/synthetic-chromium") },
}));

import { renderContractPdf } from "@/lib/pdf/render-contract";

beforeEach(() => {
  delete process.env.MOCK_PDF;
});

describe("contract PDF rendering", () => {
  it("launches the bundled Chromium executable, never a downloaded browser", async () => {
    await renderContractPdf("<p>Synthetic contract</p>");
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ executablePath: "/tmp/synthetic-chromium" }));
  });
});
