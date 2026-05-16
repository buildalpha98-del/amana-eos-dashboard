/**
 * Server-only helper for reading EmailTemplateOverride rows. Used by the
 * email-templates/* modules to overlay admin-edited copy on top of the
 * hardcoded defaults at send time.
 *
 * Caches the entire override map in-process for 60 s — sends fan out
 * in tight loops (cron + bulk campaign), so reading the same key dozens
 * of times shouldn't hit the DB.
 *
 * 2026-05-17.
 */

import { prisma } from "@/lib/prisma";
import {
  interpolateTemplate,
  type EmailTemplateManifestEntry,
} from "@/lib/email-template-manifest";

interface OverrideRow {
  subject: string;
  body: string;
}

const CACHE_TTL_MS = 60_000;
let cache: { value: Map<string, OverrideRow>; expiresAt: number } | null = null;

/** Test helper — clears the cache. */
export function _clearEmailTemplateOverrideCache() {
  cache = null;
}

async function loadAll(): Promise<Map<string, OverrideRow>> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  let rows: Array<{ key: string; subject: string; body: string }> = [];
  try {
    rows = await prisma.emailTemplateOverride.findMany({
      select: { key: true, subject: true, body: true },
    });
  } catch {
    // DB unreachable — return empty so callers fall through to defaults.
    return new Map();
  }

  const map = new Map<string, OverrideRow>();
  for (const r of rows) map.set(r.key, { subject: r.subject, body: r.body });
  cache = { value: map, expiresAt: now + CACHE_TTL_MS };
  return map;
}

/**
 * Returns the override for `key`, or null when none exists. Caches the
 * full map after the first call this minute.
 */
export async function getEmailTemplateOverride(
  key: string,
): Promise<OverrideRow | null> {
  const map = await loadAll();
  return map.get(key) ?? null;
}

/**
 * Apply an override on top of a hardcoded default. Each domain module
 * calls this from its template function:
 *
 *   const { subject, html } = await applyEmailTemplateOverride({
 *     key: "auth.welcomeEmail",
 *     defaultSubject,
 *     defaultBody,
 *     vars: { name, tempPassword, loginUrl },
 *     wrap: (body) => baseLayout(body),
 *   });
 *
 * `defaultBody` and the (optional) admin override are both treated as
 * inner-body HTML; the `wrap` function applies the shared layout. Variables
 * substitute via `{{name}}` placeholders.
 */
export async function applyEmailTemplateOverride(opts: {
  key: string;
  defaultSubject: string;
  defaultBody: string;
  vars: Record<string, string>;
  /** Wrap the inner body in the shared layout (baseLayout / marketingLayout). */
  wrap: (innerBody: string) => string;
}): Promise<{ subject: string; html: string }> {
  const override = await getEmailTemplateOverride(opts.key);
  const subjectTemplate = override?.subject ?? opts.defaultSubject;
  const bodyTemplate = override?.body ?? opts.defaultBody;
  return {
    subject: interpolateTemplate(subjectTemplate, opts.vars),
    html: opts.wrap(interpolateTemplate(bodyTemplate, opts.vars)),
  };
}

/**
 * Persist an override. Admin-only — enforced at the route layer.
 */
export async function writeEmailTemplateOverride(opts: {
  key: string;
  subject: string;
  body: string;
  updatedById: string;
}): Promise<OverrideRow> {
  const row = await prisma.emailTemplateOverride.upsert({
    where: { key: opts.key },
    create: {
      key: opts.key,
      subject: opts.subject,
      body: opts.body,
      updatedById: opts.updatedById,
    },
    update: {
      subject: opts.subject,
      body: opts.body,
      updatedById: opts.updatedById,
    },
    select: { subject: true, body: true },
  });
  _clearEmailTemplateOverrideCache();
  return row;
}

/** Delete an override → template reverts to the hardcoded default. */
export async function deleteEmailTemplateOverride(key: string): Promise<void> {
  await prisma.emailTemplateOverride.delete({ where: { key } });
  _clearEmailTemplateOverrideCache();
}

/** Returns the merged manifest with current overrides (or null). */
export async function listEmailTemplateOverrides(
  entries: EmailTemplateManifestEntry[],
): Promise<
  Array<EmailTemplateManifestEntry & { override: OverrideRow | null }>
> {
  const map = await loadAll();
  return entries.map((e) => ({
    ...e,
    override: map.get(e.key) ?? null,
  }));
}
