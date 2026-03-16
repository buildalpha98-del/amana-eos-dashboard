import { prisma } from "@/lib/prisma";

// Centre-to-state mapping (fallback if Service table lookup fails)
const CENTRE_STATE_MAP: Record<string, string> = {
  "MFIS-BH": "NSW",
  "MFIS-GR": "NSW",
  "MFIS-HP": "NSW",
  "UNITY-GR": "NSW",
  "ARKANA": "NSW",
  "AIA-KKCC": "VIC",
  "ALTAQWA": "VIC",
  "MIN-OFF": "VIC",
  "MIN-DOV": "VIC",
  "MIN-SPR": "VIC",
};

// Seat-to-role mapping for default routing
const SEAT_ROLE_MAP: Record<string, string[]> = {
  marketing: ["marketing"],
  people: ["admin", "head_office"],
  operations: ["admin", "head_office"],
  finance: ["admin", "head_office"],
  programming: ["coordinator"],
  "parent-experience": ["coordinator"],
  partnerships: ["owner"],
};

interface ResolveContext {
  assignee: string;
  seat?: string;
  serviceCode?: string;
}

/**
 * Resolves an assignee string from the automation system to actual User IDs.
 *
 * Supports three formats:
 * 1. Named ID: "daniel" → find user by name (case-insensitive)
 * 2. Pipe-separated: "mirna|tracie" → resolve by centre/state context
 * 3. Role-based: "resolve:service-coordinator" → lookup by role + context
 */
export async function resolveAssignee(
  ctx: ResolveContext
): Promise<string[]> {
  const { assignee, seat, serviceCode } = ctx;

  // System — no human target
  if (assignee === "system" || !assignee) {
    return [];
  }

  // Get state from service code if available
  let state: string | undefined;
  if (serviceCode) {
    const service = await prisma.service.findUnique({
      where: { code: serviceCode },
      select: { state: true, managerId: true },
    });
    state = service?.state ?? CENTRE_STATE_MAP[serviceCode];
  }

  // Type 3: Role-based resolution — "resolve:service-coordinator"
  if (assignee.startsWith("resolve:")) {
    const role = assignee.replace("resolve:", "");
    return resolveByRole(role, state, serviceCode, seat);
  }

  // Type 2: Pipe-separated — "mirna|tracie"
  if (assignee.includes("|")) {
    const names = assignee.split("|");

    if (state) {
      // Find users matching any of the names who are associated with this state
      const users = await prisma.user.findMany({
        where: {
          name: { in: names, mode: "insensitive" },
          active: true,
          state: state,
        },
        select: { id: true },
      });
      if (users.length > 0) return users.map((u) => u.id);
    }

    // No state context — return all matching users
    const users = await prisma.user.findMany({
      where: {
        name: { in: names, mode: "insensitive" },
        active: true,
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  // Type 1: Named ID — "daniel"
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { name: { equals: assignee, mode: "insensitive" } },
        { email: { startsWith: assignee.toLowerCase() + "@" } },
      ],
      active: true,
    },
    select: { id: true },
  });

  return user ? [user.id] : [];
}

async function resolveByRole(
  role: string,
  state?: string,
  serviceCode?: string,
  seat?: string
): Promise<string[]> {
  switch (role) {
    case "service-coordinator":
    case "centre-coordinator": {
      // First try: service manager
      if (serviceCode) {
        const service = await prisma.service.findUnique({
          where: { code: serviceCode },
          select: { managerId: true },
        });
        if (service?.managerId) return [service.managerId];
      }
      // Fallback: coordinator by state
      if (state) {
        const user = await prisma.user.findFirst({
          where: { state, role: "coordinator", active: true },
          select: { id: true },
        });
        if (user) return [user.id];
      }
      break;
    }

    case "state-manager-or-coordinator": {
      if (state) {
        const users = await prisma.user.findMany({
          where: {
            state,
            role: { in: ["coordinator", "admin"] },
            active: true,
          },
          select: { id: true },
        });
        if (users.length > 0) return users.map((u) => u.id);
      }
      break;
    }
  }

  // Ultimate fallback: seat owner or first owner
  if (seat && SEAT_ROLE_MAP[seat]) {
    const roles = SEAT_ROLE_MAP[seat] as string[];
    const users = await prisma.user.findMany({
      where: { role: { in: roles as never[] }, active: true },
      select: { id: true },
      take: 1,
    });
    if (users.length > 0) return users.map((u) => u.id);
  }

  // Last resort: owner
  const owner = await prisma.user.findFirst({
    where: { role: "owner", active: true },
    select: { id: true },
  });
  return owner ? [owner.id] : [];
}
