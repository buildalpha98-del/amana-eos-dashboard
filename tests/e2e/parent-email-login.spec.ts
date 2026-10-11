import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { seedParent, cleanupParent, disconnect, type SeededParent } from "./helpers/seed-parent-portal";

const prisma = new PrismaClient();
let seeded: SeededParent;
test.beforeEach(async () => { seeded = await seedParent({}); });
test.afterEach(async () => { if (seeded) await cleanupParent(seeded); });
test.afterAll(async () => { await disconnect(); await prisma.$disconnect(); });

for (const viewport of [{ name: "desktop", width: 1280, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`${viewport.name}: email inspection stays safe, explicit confirmation opens the family hub`, async ({ page, request, context, baseURL }) => {
    await page.setViewportSize(viewport);
    const emailUrl = `/api/parent/auth/verify?token=${seeded.rawToken}`;
    for (const method of ["GET", "HEAD", "GET"]) {
      const inspected = await request.fetch(emailUrl, { method, maxRedirects: 0 });
      expect(inspected.status()).toBe(307);
      expect(inspected.headers()["cache-control"]).toBe("no-store");
    }
    expect((await prisma.parentMagicLink.findUniqueOrThrow({ where: { id: seeded.magicLinkId } })).usedAt).toBeNull();
    await page.goto(emailUrl);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    const button = page.getByRole("button", { name: "Continue to my account" });
    await expect(button).toBeEnabled();
    expect(page.url()).toBe(`${baseURL}/parent/login/confirm`);
    expect((await context.cookies()).find(c => c.name === "parent-session")).toBeUndefined();
    expect((await prisma.parentMagicLink.findUniqueOrThrow({ where: { id: seeded.magicLinkId } })).usedAt).toBeNull();
    await expect(page.getByRole("img", { name: "Amana OSHC — Beyond the Bell" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/parent(?:\?v2=1)?$/);
    expect((await context.cookies()).find(c => c.name === "parent-session")?.httpOnly).toBe(true);
    expect((await prisma.parentMagicLink.findUniqueOrThrow({ where: { id: seeded.magicLinkId } })).usedAt).not.toBeNull();
    const replay = await request.post("/api/parent/auth/verify", { headers: { Origin: new URL(baseURL!).origin }, data: { token: seeded.rawToken } });
    expect(replay.status()).toBe(400);
    expect(replay.headers()["set-cookie"]).toBeUndefined();
  });
}

test("two concurrent confirmations issue only one session", async ({ request, baseURL }) => {
  const replies = await Promise.all([1, 2].map(() => request.post("/api/parent/auth/verify", {
    headers: { Origin: new URL(baseURL!).origin }, data: { token: seeded.rawToken },
  })));
  expect(replies.map(res => res.status()).sort()).toEqual([200, 400]);
  expect(replies.filter(res => res.headers()["set-cookie"]?.includes("parent-session="))).toHaveLength(1);
});

test("expired links explain recovery without creating a session", async ({ page, context }) => {
  await prisma.parentMagicLink.update({ where: { id: seeded.magicLinkId }, data: { expiresAt: new Date(0) } });
  await page.goto(`/api/parent/auth/verify?token=${seeded.rawToken}`);
  await page.getByRole("button", { name: "Continue to my account" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("expired or has already been used");
  await expect(page.getByRole("link", { name: "Request a new login link" })).toHaveAttribute("href", "/parent/login");
  expect((await context.cookies()).find(c => c.name === "parent-session")).toBeUndefined();
});

test("a temporary server failure can be retried from the same screen", async ({ page }) => {
  await page.goto(`/api/parent/auth/verify?token=${seeded.rawToken}`);
  await page.route("**/api/parent/auth/verify", route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal server error" }) }), { times: 1 });
  const button = page.getByRole("button", { name: "Continue to my account" });
  await button.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Please try again");
  expect((await prisma.parentMagicLink.findUniqueOrThrow({ where: { id: seeded.magicLinkId } })).usedAt).toBeNull();
  await button.click();
  await expect(page).toHaveURL(/\/parent(?:\?v2=1)?$/);
});

test("a blocked database claim rolls back and leaves the link usable", async ({ request, baseURL }) => {
  let releaseLock!: () => void;
  let lockReady!: () => void;
  const ready = new Promise<void>(resolve => { lockReady = resolve; });
  const release = new Promise<void>(resolve => { releaseLock = resolve; });
  const locker = prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ParentMagicLink" WHERE id = ${seeded.magicLinkId} FOR UPDATE`;
    lockReady();
    await release;
  }, { timeout: 15_000 });
  try {
    await ready;
    const blocked = await request.post("/api/parent/auth/verify", {
      headers: { Origin: new URL(baseURL!).origin }, data: { token: seeded.rawToken },
    });
    expect(blocked.status()).toBe(500);
    expect(blocked.headers()["set-cookie"]).toBeUndefined();
  } finally { releaseLock(); await locker; }
  expect((await prisma.parentMagicLink.findUniqueOrThrow({ where: { id: seeded.magicLinkId } })).usedAt).toBeNull();
  const retry = await request.post("/api/parent/auth/verify", {
    headers: { Origin: new URL(baseURL!).origin }, data: { token: seeded.rawToken },
  });
  expect(retry.status()).toBe(200);
});
