/**
 * One list of everything assigned to a staff member.
 *
 * Training and onboarding are two separate systems that have never known
 * about each other: `LMSEnrollment` holds courses, `StaffOnboarding`
 * holds pack assignments, and no screen showed both. So "what does this
 * person still have to do?" needed two places and a mental join.
 *
 * They stay separate on the server — different tables, different
 * completion semantics, different routes — and are merged here, for
 * display. This module is the merge: two API shapes in, one sortable row
 * type out, so the component renders a single list and the mapping is
 * testable on its own.
 */

export type AssignmentKind = "training" | "onboarding";

/** A row from GET /api/lms/assignments. */
export interface TrainingAssignment {
  enrollmentId: string;
  status: string;
  dueDate: string | null;
  enrolledAt: string;
  completedAt: string | null;
  user: { id: string; name: string; email: string; role: string };
  course: { id: string; title: string; track: string; status: string };
  progressPct: number;
  countedInCompliance: boolean;
}

/** A row from GET /api/onboarding/assign. */
export interface OnboardingAssignment {
  id: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
  user: { id: string; name: string; email: string };
  pack: {
    id: string;
    name: string;
    service?: { name: string } | null;
    _count?: { tasks: number };
  };
  progress?: Array<{ completed: boolean }>;
}

export interface UnifiedAssignment {
  kind: AssignmentKind;
  /** The id to pass back when editing or removing THIS row. */
  assignmentId: string;
  title: string;
  /** Track for a course, service for a pack. May be empty. */
  subtitle: string;
  status: string;
  dueDate: string | null;
  assignedAt: string;
  progressPct: number;
  userId: string;
  userName: string;
  userEmail: string;
  /** Role is only carried on training rows; onboarding doesn't select it. */
  userRole: string | null;
  /**
   * Whether the weekly compliance report counts this. Training only —
   * null for onboarding, which that report has never looked at. Null and
   * false mean different things and must not be collapsed: false says
   * "not counted, here's why", null says "not applicable".
   */
  countedInCompliance: boolean | null;
  /** Present on training rows; drives the "draft" badge. */
  courseStatus: string | null;
}

export function fromTraining(a: TrainingAssignment): UnifiedAssignment {
  return {
    kind: "training",
    assignmentId: a.enrollmentId,
    title: a.course.title,
    subtitle: a.course.track,
    status: a.status,
    dueDate: a.dueDate,
    assignedAt: a.enrolledAt,
    progressPct: a.progressPct,
    userId: a.user.id,
    userName: a.user.name,
    userEmail: a.user.email,
    userRole: a.user.role,
    countedInCompliance: a.countedInCompliance,
    courseStatus: a.course.status,
  };
}

export function fromOnboarding(a: OnboardingAssignment): UnifiedAssignment {
  /**
   * Progress comes as per-task rows rather than a percentage.
   *
   * `_count.tasks` is the pack's CURRENT task count while `progress` is
   * the assignment's snapshot; the assign route backfills the gap
   * lazily, so mid-backfill the two can disagree. Using the longer of
   * the two as the denominator keeps the percentage from reading above
   * 100 in that window.
   */
  const done = a.progress?.filter((p) => p.completed).length ?? 0;
  const total = Math.max(a.progress?.length ?? 0, a.pack._count?.tasks ?? 0);

  return {
    kind: "onboarding",
    assignmentId: a.id,
    title: a.pack.name,
    subtitle: a.pack.service?.name ?? "All centres",
    status: a.status,
    dueDate: a.dueDate,
    assignedAt: a.createdAt,
    progressPct: total > 0 ? Math.round((done / total) * 100) : 0,
    userId: a.user.id,
    userName: a.user.name,
    userEmail: a.user.email,
    userRole: null,
    countedInCompliance: null,
    courseStatus: null,
  };
}

/** Everything for one person, in the order it should be shown. */
export interface AssignmentGroup {
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string | null;
  items: UnifiedAssignment[];
}

/**
 * Merge both sources, filter by search, and group by person.
 *
 * Grouping is by user id, not name — two staff can share a name, and
 * collapsing them would put one person's assignments under another's.
 *
 * The role shown for a group comes from whichever row carries one:
 * onboarding rows don't select it, so a person with only pack
 * assignments would otherwise render with a blank role.
 */
export function groupAssignments(
  training: TrainingAssignment[],
  onboarding: OnboardingAssignment[],
  opts: { search?: string; kind?: AssignmentKind | "all" } = {},
): AssignmentGroup[] {
  const kind = opts.kind ?? "all";
  const rows: UnifiedAssignment[] = [
    ...(kind === "onboarding" ? [] : training.map(fromTraining)),
    ...(kind === "training" ? [] : onboarding.map(fromOnboarding)),
  ];

  const q = opts.search?.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.userName.toLowerCase().includes(q) ||
          r.userEmail.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q),
      )
    : rows;

  const byUser = new Map<string, AssignmentGroup>();
  for (const r of filtered) {
    let g = byUser.get(r.userId);
    if (!g) {
      g = {
        userId: r.userId,
        userName: r.userName,
        userEmail: r.userEmail,
        userRole: r.userRole,
        items: [],
      };
      byUser.set(r.userId, g);
    }
    // First row with a role wins; see the note above.
    if (!g.userRole && r.userRole) g.userRole = r.userRole;
    g.items.push(r);
  }

  for (const g of byUser.values()) {
    // Outstanding first, then oldest assignment — the things someone
    // still has to do lead, and the oldest of those is the most overdue
    // question.
    g.items.sort(
      (a, b) =>
        Number(a.status === "completed") - Number(b.status === "completed") ||
        a.assignedAt.localeCompare(b.assignedAt),
    );
  }

  return [...byUser.values()].sort((a, b) =>
    a.userName.localeCompare(b.userName),
  );
}
