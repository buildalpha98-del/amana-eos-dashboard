/**
 * Is this course fit to publish?
 *
 * Publishing an essential course is not a visibility change — it arms the
 * induction gate. `getInductionReadiness` counts PUBLISHED essential
 * courses only, so the moment one goes live it becomes something a new
 * starter must finish before they can be rostered or clock in.
 *
 * That makes a broken course far worse than an invisible one. The
 * sharpest case: a quiz module with no questions. `canAdvanceModule`
 * only lets a learner past a quiz once it is PASSED, and a quiz with
 * nothing to answer can never be passed — so that learner can never
 * complete the course, never clear induction, and never clock in. There
 * is no error message for this; the course simply becomes a wall.
 *
 * Hence blockers vs warnings. A blocker is something that makes the
 * course impossible to complete and is refused outright. A warning is
 * something suspicious but survivable — thin content that may still be
 * the seeded placeholder — which a human can look at and override.
 */

export type ModuleType =
  | "document"
  | "video"
  | "quiz"
  | "checklist"
  | "external_link";

export interface ReadinessModule {
  id: string;
  title: string;
  type: ModuleType | string;
  content: string | null;
  resourceUrl: string | null;
  documentId: string | null;
  /** Count of ACTIVE questions. Inactive ones can't be answered. */
  activeQuestionCount: number;
}

export interface ReadinessCourse {
  id: string;
  title: string;
  status: string;
  modules: ReadinessModule[];
}

export interface ReadinessIssue {
  moduleTitle: string | null;
  message: string;
}

export interface CourseReadiness {
  courseId: string;
  courseTitle: string;
  /** No blockers. Warnings do not prevent publishing. */
  publishable: boolean;
  blockers: ReadinessIssue[];
  warnings: ReadinessIssue[];
}

/**
 * Below this, a document module's body is more likely to be a stub than a
 * lesson.
 *
 * 400 characters is roughly the length of the seeded placeholders (2–4
 * sentences). It is deliberately a WARNING and not a blocker: a genuinely
 * short module is legitimate, and refusing to publish one would be this
 * check overreaching into editorial judgement.
 */
const THIN_CONTENT_CHARS = 400;

/** A module a learner can actually work through and finish. */
function checkModule(m: ReadinessModule): {
  blockers: ReadinessIssue[];
  warnings: ReadinessIssue[];
} {
  const blockers: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];
  const at = (message: string) => ({ moduleTitle: m.title, message });

  if (m.type === "quiz") {
    // The wall case. Nothing else in this file matters as much.
    if (m.activeQuestionCount === 0) {
      blockers.push(
        at(
          "Quiz has no active questions, so it can never be passed — anyone assigned this course would be permanently unable to finish it.",
        ),
      );
    }
    return { blockers, warnings };
  }

  if (m.type === "external_link") {
    if (!m.resourceUrl?.trim()) {
      blockers.push(at("Link module has no URL."));
    }
    return { blockers, warnings };
  }

  if (m.type === "video") {
    if (!m.resourceUrl?.trim()) {
      blockers.push(at("Video module has no video URL."));
    }
    return { blockers, warnings };
  }

  // document / checklist / anything else: needs something to read. An
  // attached document or a resource link counts — the body doesn't have
  // to carry it.
  const hasBody = Boolean(m.content?.trim());
  const hasAttachment = Boolean(m.documentId || m.resourceUrl?.trim());
  if (!hasBody && !hasAttachment) {
    blockers.push(at("Module is empty — no content, document or link."));
    return { blockers, warnings };
  }

  if (hasBody && !hasAttachment && (m.content?.trim().length ?? 0) < THIN_CONTENT_CHARS) {
    warnings.push(
      at(
        `Only ${m.content?.trim().length ?? 0} characters — check this isn't still the seeded placeholder.`,
      ),
    );
  }

  return { blockers, warnings };
}

/** Assess one course. */
export function assessCourse(course: ReadinessCourse): CourseReadiness {
  const blockers: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];

  if (course.modules.length === 0) {
    blockers.push({
      moduleTitle: null,
      message: "Course has no modules — there is nothing to complete.",
    });
  }

  for (const m of course.modules) {
    const r = checkModule(m);
    blockers.push(...r.blockers);
    warnings.push(...r.warnings);
  }

  return {
    courseId: course.id,
    courseTitle: course.title,
    publishable: blockers.length === 0,
    blockers,
    warnings,
  };
}

/** Assess a set of courses, worst first so the problems lead. */
export function assessCourses(courses: ReadinessCourse[]): CourseReadiness[] {
  return courses
    .map(assessCourse)
    .sort(
      (a, b) =>
        b.blockers.length - a.blockers.length ||
        b.warnings.length - a.warnings.length ||
        a.courseTitle.localeCompare(b.courseTitle),
    );
}
