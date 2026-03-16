import { describe, it, expect } from "vitest";
import {
  programSchema,
  todosSchema,
  todoUpdateSchema,
  announcementSchema,
  calendarEventsSchema,
} from "@/app/api/_lib/validation";

// ── programSchema ─────────────────────────────────────────

describe("programSchema", () => {
  const validProgram = {
    weekCommencing: "2026-03-10",
    theme: "Nature Week",
    programFile: { filename: "prog.pdf", data: "base64data" },
  };

  it("accepts valid program with base64 file", () => {
    const result = programSchema.safeParse(validProgram);
    expect(result.success).toBe(true);
  });

  it("accepts valid program with URL instead of file", () => {
    const result = programSchema.safeParse({
      weekCommencing: "2026-03-10",
      theme: "Nature Week",
      programFileUrl: "https://example.com/file.pdf",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when neither programFile nor programFileUrl is provided", () => {
    const result = programSchema.safeParse({
      weekCommencing: "2026-03-10",
      theme: "Nature Week",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty theme", () => {
    const result = programSchema.safeParse({
      ...validProgram,
      theme: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = programSchema.safeParse({
      ...validProgram,
      weekCommencing: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid programFileUrl", () => {
    const result = programSchema.safeParse({
      weekCommencing: "2026-03-10",
      theme: "Nature Week",
      programFileUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional fields as null or undefined", () => {
    const result = programSchema.safeParse({
      ...validProgram,
      category: null,
      summary: null,
      resourceFile: null,
      displayFile: null,
    });
    expect(result.success).toBe(true);
  });

  it("transforms weekCommencing string to Date", () => {
    const result = programSchema.safeParse(validProgram);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weekCommencing).toBeInstanceOf(Date);
    }
  });
});

// ── todosSchema ───────────────────────────────────────────

describe("todosSchema", () => {
  const validTodos = {
    centreId: "mfis-beaumont-hills",
    date: "2026-03-15",
    todos: [
      { title: "Set up tables", category: "morning-prep" },
    ],
  };

  it("accepts valid todos", () => {
    const result = todosSchema.safeParse(validTodos);
    expect(result.success).toBe(true);
  });

  it("rejects invalid centreId", () => {
    const result = todosSchema.safeParse({
      ...validTodos,
      centreId: "not-a-centre",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty centreId", () => {
    const result = todosSchema.safeParse({
      ...validTodos,
      centreId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty todos array", () => {
    const result = todosSchema.safeParse({
      ...validTodos,
      todos: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects todo with empty title", () => {
    const result = todosSchema.safeParse({
      ...validTodos,
      todos: [{ title: "", category: "morning-prep" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid todo category", () => {
    const result = todosSchema.safeParse({
      ...validTodos,
      todos: [{ title: "Task", category: "invalid-category" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid centre IDs", () => {
    const validCentres = [
      "mfis-beaumont-hills",
      "mfis-greenacre",
      "mfis-hoxton-park",
      "unity-grammar",
      "arkana-college",
      "aia-kkcc",
      "al-taqwa-college",
      "minaret-officer",
      "minaret-doveton",
      "minaret-springvale",
    ];
    for (const centreId of validCentres) {
      const result = todosSchema.safeParse({ ...validTodos, centreId });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all valid categories", () => {
    for (const category of ["morning-prep", "afternoon-prep", "end-of-day"] as const) {
      const result = todosSchema.safeParse({
        ...validTodos,
        todos: [{ title: "Task", category }],
      });
      expect(result.success).toBe(true);
    }
  });

  it("defaults category to morning-prep when not provided", () => {
    const result = todosSchema.safeParse({
      ...validTodos,
      todos: [{ title: "No category" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.todos[0].category).toBe("morning-prep");
    }
  });

  it("validates dueTime HH:MM format", () => {
    const result = todosSchema.safeParse({
      ...validTodos,
      todos: [{ title: "Task", dueTime: "14:30" }],
    });
    expect(result.success).toBe(true);

    const bad = todosSchema.safeParse({
      ...validTodos,
      todos: [{ title: "Task", dueTime: "2:30pm" }],
    });
    expect(bad.success).toBe(false);
  });

  it("rejects invalid date", () => {
    const result = todosSchema.safeParse({
      ...validTodos,
      date: "not-a-date",
    });
    expect(result.success).toBe(false);
  });
});

// ── todoUpdateSchema ──────────────────────────────────────

describe("todoUpdateSchema", () => {
  it("accepts valid update", () => {
    expect(todoUpdateSchema.safeParse({ completed: true }).success).toBe(true);
    expect(todoUpdateSchema.safeParse({ completed: false }).success).toBe(true);
  });

  it("accepts completedBy", () => {
    const result = todoUpdateSchema.safeParse({
      completed: true,
      completedBy: "John Smith",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing completed field", () => {
    const result = todoUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean completed", () => {
    const result = todoUpdateSchema.safeParse({ completed: "yes" });
    expect(result.success).toBe(false);
  });
});

// ── announcementSchema ────────────────────────────────────

describe("announcementSchema", () => {
  const validAnnouncement = {
    title: "Welcome Back",
    body: "Welcome to term 2!",
    type: "general" as const,
  };

  it("accepts valid announcement", () => {
    const result = announcementSchema.safeParse(validAnnouncement);
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = announcementSchema.safeParse({ ...validAnnouncement, title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects empty body", () => {
    const result = announcementSchema.safeParse({ ...validAnnouncement, body: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = announcementSchema.safeParse({ ...validAnnouncement, type: "blog" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid announcement types", () => {
    for (const type of [
      "program-update",
      "newsletter-summary",
      "general",
      "holiday-quest",
      "reminder",
    ]) {
      const result = announcementSchema.safeParse({ ...validAnnouncement, type });
      expect(result.success).toBe(true);
    }
  });

  it("defaults targetCentres, attachments, pinned", () => {
    const result = announcementSchema.safeParse(validAnnouncement);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetCentres).toEqual(["all"]);
      expect(result.data.attachments).toEqual([]);
      expect(result.data.pinned).toBe(false);
    }
  });

  it("accepts optional expiresAt date", () => {
    const result = announcementSchema.safeParse({
      ...validAnnouncement,
      expiresAt: "2026-04-01",
    });
    expect(result.success).toBe(true);
  });
});

// ── calendarEventsSchema ──────────────────────────────────

describe("calendarEventsSchema", () => {
  const validEvents = {
    events: [
      { title: "Excursion", date: "2026-03-20", type: "excursion" as const },
    ],
  };

  it("accepts valid events", () => {
    const result = calendarEventsSchema.safeParse(validEvents);
    expect(result.success).toBe(true);
  });

  it("rejects empty events array", () => {
    const result = calendarEventsSchema.safeParse({ events: [] });
    expect(result.success).toBe(false);
  });

  it("rejects event with empty title", () => {
    const result = calendarEventsSchema.safeParse({
      events: [{ title: "", date: "2026-03-20", type: "excursion" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid event type", () => {
    const result = calendarEventsSchema.safeParse({
      events: [{ title: "Party", date: "2026-03-20", type: "party" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid event types", () => {
    for (const type of [
      "excursion",
      "incursion",
      "public-holiday",
      "pupil-free",
      "term-date",
      "event",
      "holiday-quest",
    ]) {
      const result = calendarEventsSchema.safeParse({
        events: [{ title: "Event", date: "2026-03-20", type }],
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts optional endDate and details", () => {
    const result = calendarEventsSchema.safeParse({
      events: [
        {
          title: "Term Break",
          date: "2026-04-01",
          endDate: "2026-04-14",
          type: "term-date",
          details: "School holiday period",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid date format in events", () => {
    const result = calendarEventsSchema.safeParse({
      events: [{ title: "Event", date: "March 20", type: "event" }],
    });
    expect(result.success).toBe(false);
  });
});
