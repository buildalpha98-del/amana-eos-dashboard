import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";

declare global {
  // eslint-disable-next-line no-var
  var __contractBrowser: Browser | undefined;
}

async function getBrowser(): Promise<Browser> {
  if (globalThis.__contractBrowser) return globalThis.__contractBrowser;
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  globalThis.__contractBrowser = browser;
  return browser;
}

export async function renderContractPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `<div style="font-size:9px;color:#666;width:100%;text-align:center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
