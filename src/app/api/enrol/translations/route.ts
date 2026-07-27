/**
 * GET /api/enrol/translations?locale=xx
 *
 * Public — the enrolment wizard is unauthenticated (parents haven't
 * logged in yet). Returns { [key]: text } for every translation row
 * matching the locale. Missing keys are resolved client-side by falling
 * back to the English source in `src/lib/enrol-i18n.ts`.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError } from "@/lib/api-error";
import { ENROL_TRANSLATIONS_SOURCE } from "@/lib/enrol-translations-source";

const ALLOWED_LOCALES = new Set(["en", "ar", "ur", "so", "ps", "tr"]);

export const GET = withApiHandler(async (req) => {
  const url = new URL(req.url);
  const locale = url.searchParams.get("locale") ?? "en";

  if (!ALLOWED_LOCALES.has(locale)) {
    throw ApiError.badRequest("Unsupported locale");
  }

  // English is the source of truth in code — no DB rows needed.
  if (locale === "en") {
    return NextResponse.json({});
  }

  // 2026-07-27: response merges the code source (AI translations shipped
  // with the deploy) with any per-key DB overrides staff have made via
  // /settings/enrol-translations. DB wins per key; missing keys in both
  // fall through to the client's English defaults.
  const source = ENROL_TRANSLATIONS_SOURCE[locale] ?? {};
  const rows = await prisma.enrolFormTranslation.findMany({
    where: { locale },
    select: { key: true, text: true },
  });
  const overrides: Record<string, string> = {};
  for (const r of rows) overrides[r.key] = r.text;

  const merged = { ...source, ...overrides };

  return NextResponse.json(merged, {
    headers: {
      // Cache aggressively — translations rarely change and the fallback
      // to English is safe when they're stale.
      "Cache-Control": "public, max-age=300, s-maxage=600",
    },
  });
});
