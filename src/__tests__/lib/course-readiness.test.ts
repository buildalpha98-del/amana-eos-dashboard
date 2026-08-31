import { describe, it, expect } from "vitest";
import {
  assessCourse,
  assessCourses,
  type ReadinessModule,
} from "@/lib/course-readiness";

const LONG = "x".repeat(500);

const doc = (over: Partial<ReadinessModule> = {}): ReadinessModule => ({
  id: "m-1",
  title: "Who we are",
  type: "document",
  content: LONG,
  resourceUrl: null,
  documentId: null,
  activeQuestionCount: 0,
  ...over,
});

const quiz = (over: Partial<ReadinessModule> = {}): ReadinessModule => ({
  id: "m-q",
  title: "Quick check",
  type: "quiz",
  content: null,
  resourceUrl: null,
  documentId: null,
  activeQuestionCount: 5,
  ...over,
});

const course = (modules: ReadinessModule[]) => ({
  id: "c-1",
  title: "The Amana Way",
  status: "draft",
  modules,
});

describe("assessCourse — the wall cases", () => {
  it("blocks a quiz with no active questions", () => {
    // The sharpest failure in the whole system: canAdvanceModule only
    // lets a learner past a quiz once PASSED, so a quiz with nothing to
    // answer can never be passed. They can never finish the course,
    // never clear induction, and never clock in.
    const r = assessCourse(course([doc(), quiz({ activeQuestionCount: 0 })]));
    expect(r.publishable).toBe(false);
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0].message).toMatch(/never be passed/i);
    expect(r.blockers[0].moduleTitle).toBe("Quick check");
  });

  it("blocks a course with no modules at all", () => {
    const r = assessCourse(course([]));
    expect(r.publishable).toBe(false);
    expect(r.blockers[0].message).toMatch(/no modules/i);
  });

  it("blocks a document module with nothing in it", () => {
    const r = assessCourse(course([doc({ content: null })]));
    expect(r.publishable).toBe(false);
    expect(r.blockers[0].message).toMatch(/empty/i);
  });

  it("blocks a whitespace-only document module", () => {
    const r = assessCourse(course([doc({ content: "   \n  " })]));
    expect(r.publishable).toBe(false);
  });

  it("blocks a video module with no URL", () => {
    const r = assessCourse(
      course([doc(), { ...doc(), id: "m-v", type: "video", content: null }]),
    );
    expect(r.publishable).toBe(false);
    expect(r.blockers[0].message).toMatch(/video url/i);
  });

  it("blocks a link module with no URL", () => {
    const r = assessCourse(
      course([{ ...doc(), type: "external_link", content: LONG }]),
    );
    expect(r.publishable).toBe(false);
    expect(r.blockers[0].message).toMatch(/no url/i);
  });
});

describe("assessCourse — passes", () => {
  it("passes a well-formed course", () => {
    const r = assessCourse(course([doc(), doc({ id: "m-2" }), quiz()]));
    expect(r.publishable).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("accepts a module carried by an attached document instead of body text", () => {
    const r = assessCourse(
      course([doc({ content: null, documentId: "doc-1" })]),
    );
    expect(r.publishable).toBe(true);
  });

  it("accepts a module carried by a resource link", () => {
    const r = assessCourse(
      course([doc({ content: null, resourceUrl: "https://x/handbook.pdf" })]),
    );
    expect(r.publishable).toBe(true);
  });

  it("accepts a video module with a URL", () => {
    const r = assessCourse(
      course([
        { ...doc(), type: "video", content: null, resourceUrl: "https://y/v" },
      ]),
    );
    expect(r.publishable).toBe(true);
  });
});

describe("assessCourse — warnings, which never block", () => {
  it("warns on thin body text that may still be the seeded placeholder", () => {
    // The seeded modules are 2–4 sentences. Short is suspicious, not
    // wrong — refusing to publish a genuinely brief module would be the
    // check overreaching into editorial judgement.
    const r = assessCourse(course([doc({ content: "Two short sentences." })]));
    expect(r.publishable).toBe(true);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].message).toMatch(/placeholder/i);
  });

  it("does not warn when short body text is backed by an attachment", () => {
    const r = assessCourse(
      course([doc({ content: "See attached.", documentId: "doc-1" })]),
    );
    expect(r.warnings).toEqual([]);
  });

  it("does not warn on a quiz for having no body text", () => {
    const r = assessCourse(course([quiz()]));
    expect(r.warnings).toEqual([]);
    expect(r.publishable).toBe(true);
  });

  it("reports the actual character count so it can be judged", () => {
    const r = assessCourse(course([doc({ content: "abc" })]));
    expect(r.warnings[0].message).toContain("3 characters");
  });
});

describe("assessCourse — multiple issues", () => {
  it("collects every blocker rather than stopping at the first", () => {
    const r = assessCourse(
      course([doc({ content: null }), quiz({ activeQuestionCount: 0 })]),
    );
    expect(r.blockers).toHaveLength(2);
  });

  it("can report blockers and warnings together", () => {
    const r = assessCourse(
      course([doc({ content: "thin" }), quiz({ activeQuestionCount: 0 })]),
    );
    expect(r.blockers).toHaveLength(1);
    expect(r.warnings).toHaveLength(1);
    expect(r.publishable).toBe(false);
  });
});

describe("assessCourses", () => {
  it("sorts the worst first so problems lead", () => {
    const ok = { ...course([doc(), quiz()]), id: "ok", title: "Fine" };
    const warned = {
      ...course([doc({ content: "thin" }), quiz()]),
      id: "warn",
      title: "Thin",
    };
    const broken = {
      ...course([quiz({ activeQuestionCount: 0 })]),
      id: "bad",
      title: "Broken",
    };

    const out = assessCourses([ok, warned, broken]);
    expect(out.map((r) => r.courseId)).toEqual(["bad", "warn", "ok"]);
  });

  it("returns an entry per course", () => {
    expect(assessCourses([course([doc()])])).toHaveLength(1);
  });

  it("handles an empty list", () => {
    expect(assessCourses([])).toEqual([]);
  });
});
