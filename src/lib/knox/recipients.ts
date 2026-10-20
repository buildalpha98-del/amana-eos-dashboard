import type { PrismaClient } from "@prisma/client";
import type { ServiceLite } from "@/lib/knox/types";

export interface Recipient {
  id: string;
  name: string | null;
  email: string;
}

export interface Recipients {
  /** Director(s) of Service for the centre. Empty when nothing resolves. */
  directors: Recipient[];
  /** Head-office users scoped to the centre's state, else all head office. */
  stateManagers: Recipient[];
  owners: Recipient[];
  /** True when no active Director of Service could be resolved. */
  noDirector: boolean;
}

const RECIPIENT_SELECT = { id: true, name: true, email: true } as const;

function dedupe(rows: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ id: r.id, name: r.name, email: r.email });
  }
  return out;
}

/**
 * Director of Service, in priority order: Service.managerId (if that user is
 * active), then active memberships labelled /director/i at this service, then
 * active users with role `member` whose home service is this one. First
 * non-empty step wins. Shared centre mailboxes (`isCentreAccount`) are never
 * people, so every step excludes them; otherwise the mailbox would be returned
 * as the "director" and hide the no-director escalation. Read-only: at most
 * three queries.
 */
async function resolveDirectors(
  db: PrismaClient,
  service: ServiceLite,
): Promise<Recipient[]> {
  if (service.managerId) {
    const manager = await db.user.findUnique({
      where: { id: service.managerId, active: true, isCentreAccount: false },
      select: RECIPIENT_SELECT,
    });
    if (manager) return dedupe([manager]);
  }

  const memberships = await db.userServiceMembership.findMany({
    where: {
      serviceId: service.id,
      status: "active",
      OR: [{ endDate: null }, { endDate: { gt: new Date() } }],
      roleAtService: { contains: "director", mode: "insensitive" },
      user: { active: true, isCentreAccount: false },
    },
    select: { user: { select: RECIPIENT_SELECT } },
  });
  const fromMemberships = dedupe(memberships.map((m) => m.user));
  if (fromMemberships.length > 0) return fromMemberships;

  const members = await db.user.findMany({
    where: {
      role: "member",
      serviceId: service.id,
      active: true,
      isCentreAccount: false,
    },
    select: RECIPIENT_SELECT,
  });
  return dedupe(members);
}

/**
 * Resolve who Knox alerts for one service: its Director(s) of Service, the
 * State Manager(s) for its state, and the owners. Buckets are independent
 * (a person can appear in more than one); each is deduped by user id. Every
 * query filters `active: true`. Read-only, at most four round trips.
 */
export async function resolveRecipients(
  db: PrismaClient,
  service: ServiceLite,
): Promise<Recipients> {
  const [directors, leadership] = await Promise.all([
    resolveDirectors(db, service),
    db.user.findMany({
      where: { role: { in: ["owner", "head_office"] }, active: true },
      select: { ...RECIPIENT_SELECT, role: true, state: true },
    }),
  ]);

  const owners = dedupe(leadership.filter((u) => u.role === "owner"));

  const headOffice = leadership.filter((u) => u.role === "head_office");
  const wanted = service.state?.trim().toLowerCase();
  const inState = wanted
    ? headOffice.filter((u) => u.state?.trim().toLowerCase() === wanted)
    : [];
  const stateManagers = dedupe(inState.length > 0 ? inState : headOffice);

  return { directors, stateManagers, owners, noDirector: directors.length === 0 };
}
