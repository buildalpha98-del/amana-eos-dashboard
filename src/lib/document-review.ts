/**
 * Helpers for the admin "Needs review" list on /documents (2026-10-07).
 *
 * A loose document — no centre, not org-wide, not assigned to anyone — is
 * now visible only to admins and its uploader (document-visibility.ts). That
 * stopped the leak, but it also means those files reach nobody they were
 * meant for. The review list puts each one in front of an admin with a
 * suggested decision: personal-looking files get "assign to <person>",
 * everything else gets "share with everyone" or "limit to a centre".
 * Pure, so the heuristics are testable.
 */

const PERSONAL_PATTERN =
  /\b(contract|employment agreement|offer letter|payslip|pay slip|tax file|tfn|super(annuation)? choice|bank details|resume|cv|police check|wwcc|working with children|first aid|cpr|visa|passport|licen[cs]e|warning letter|termination|resignation|performance review|medical certificate)\b/i;

export function looksPersonal(doc: { title: string; fileName: string; category: string }): boolean {
  return doc.category === "hr" || PERSONAL_PATTERN.test(`${doc.title} ${doc.fileName}`);
}

function normalise(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/**
 * The staff member a file is probably about, by name in its title or file
 * name: a full-name match wins; otherwise a first name, but only when exactly
 * one active person has it (two "Sarah"s means no guess).
 */
export function suggestAssignee<U extends { id: string; name: string }>(
  doc: { title: string; fileName: string },
  users: readonly U[],
): U | null {
  const hay = normalise(`${doc.title} ${doc.fileName}`);
  const full = users.filter((u) => {
    const n = normalise(u.name).trim();
    return n.includes(" ") && hay.includes(` ${n} `);
  });
  if (full.length === 1) return full[0];

  const byFirst = new Map<string, U[]>();
  for (const u of users) {
    const first = normalise(u.name).trim().split(" ")[0];
    if (first.length < 3) continue;
    byFirst.set(first, [...(byFirst.get(first) ?? []), u]);
  }
  const hits = [...byFirst.entries()].filter(([first]) => hay.includes(` ${first} `));
  if (hits.length === 1 && hits[0][1].length === 1) return hits[0][1][0];
  return null;
}
