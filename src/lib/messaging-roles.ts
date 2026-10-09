/**
 * Who may read and answer parent messages (2026-10-09). The office and
 * marketing in the Contact Centre, and a centre's Coordinator / centre
 * login from the centre page (server-side centre scoping keeps them to
 * their own centre). Never educators. Client-safe: the nav badge uses it
 * so an educator's browser doesn't poll an inbox it can't open.
 */
export const MESSAGING_ROLES = ["owner", "head_office", "admin", "eos", "marketing", "member"] as const;

export function canReadParentMessages(role: string | null | undefined): boolean {
  return !!role && (MESSAGING_ROLES as readonly string[]).includes(role);
}
