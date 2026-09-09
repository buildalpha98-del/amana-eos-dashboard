import type { Page } from "@playwright/test";

/**
 * Open the first service's detail page with the given query params.
 *
 * Reads the link's href from /services and navigates directly instead of
 * clicking through — that saves a throwaway SPA navigation per test and
 * avoids waiting on `networkidle`, which React Query polling can starve
 * for the full timeout (the pattern weekly-roll-call.spec.ts established).
 *
 * Returns the detail URL it navigated to (path + query).
 */
export async function gotoFirstService(
  page: Page,
  params: Record<string, string> = {},
): Promise<string> {
  await page.goto("/services");
  const link = page.locator("a[href^='/services/']").first();
  await link.waitFor({ state: "attached", timeout: 30_000 });
  const href = await link.getAttribute("href");
  if (!href) throw new Error("No service link found on /services");

  const url = new URL(href, "http://placeholder.local");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const target = url.pathname + url.search;
  await page.goto(target);
  return target;
}
