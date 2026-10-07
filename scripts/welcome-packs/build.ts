/**
 * Build the parent welcome pack PDFs, one per centre.
 *
 *   npx tsx scripts/welcome-packs/build.ts [outDir] [--only=Arkana-College] [--html]
 *
 * Prints with the locally installed Google Chrome (Playwright `channel:
 * "chrome"`), so no Playwright browser download is needed. Fonts load from
 * Google Fonts, so this needs a network connection.
 *
 * Fails if any page's content overflows its fixed A4 box — a pack with a
 * clipped paragraph is worse than no pack.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CENTRES } from "./centres";
import { renderWelcomePack } from "./template";

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(here, "../..");

const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) ?? path.join(repo, "welcome-packs-out"));
const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const keepHtml = args.includes("--html");

async function main() {
  mkdirSync(outDir, { recursive: true });
  const work = mkdtempSync(path.join(tmpdir(), "welcome-packs-"));
  const assets = {
    assetBase: pathToFileURL(path.join(here, "assets")).href,
    publicBase: pathToFileURL(path.join(repo, "public")).href,
  };

  const centres = only ? CENTRES.filter((c) => c.slug === only) : CENTRES;
  if (centres.length === 0) throw new Error(`No centre with slug ${only}`);

  const browser = await chromium.launch({ channel: "chrome" });
  const problems: string[] = [];
  try {
    const page = await browser.newPage();
    for (const c of centres) {
      const html = renderWelcomePack(c, assets);
      const htmlPath = path.join(keepHtml ? outDir : work, `Amana-OSHC-Welcome-Pack-${c.slug}.html`);
      writeFileSync(htmlPath, html);
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);

      const overflow = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>(".page")).flatMap((p, i) => {
          const body = p.querySelector<HTMLElement>(".page-body");
          if (!body) return [];
          const over = body.scrollHeight - body.clientHeight;
          return over > 1 ? [`page ${i + 1} overflows by ${over}px`] : [];
        }),
      );
      const fontsOk = await page.evaluate(
        () => {
          const loaded = new Set(
            Array.from(document.fonts).filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")),
          );
          return loaded.has("Fredoka") && loaded.has("Barlow Condensed");
        },
      );
      if (!fontsOk) problems.push(`${c.slug}: brand fonts did not load (offline?)`);
      problems.push(...overflow.map((o) => `${c.slug}: ${o}`));

      const pdfPath = path.join(outDir, `Amana-OSHC-Welcome-Pack-${c.slug}.pdf`);
      await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
      console.log(`${overflow.length ? "!" : "✓"} ${path.basename(pdfPath)}`);
    }
  } finally {
    await browser.close();
  }

  if (problems.length) {
    console.error(`\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`\n${centres.length} pack(s) written to ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
