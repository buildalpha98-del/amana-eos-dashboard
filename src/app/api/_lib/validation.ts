import { z } from "zod";
import {
  CENTRE_IDS,
  TODO_CATEGORIES,
  ANNOUNCEMENT_TYPES,
  EVENT_TYPES,
} from "./constants";

// ── Shared helpers ───────────────────────────────────────────

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "Must be an ISO date (YYYY-MM-DD)")
  .transform((v) => new Date(v))
  .refine((d) => !isNaN(d.getTime()), "Invalid date");

const optionalIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "Must be an ISO date")
  .transform((v) => new Date(v))
  .refine((d) => !isNaN(d.getTime()), "Invalid date")
  .nullable()
  .optional();

const base64File = z.object({
  filename: z.string().min(1, "Filename is required"),
  data: z.string().min(1, "File data is required"),
});

// ── Programs ─────────────────────────────────────────────────

export const programSchema = z.object({
  weekCommencing: isoDateString,
  theme: z.string().min(1, "theme is required"),
  category: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  programFile: base64File.nullable().optional(),
  programFileUrl: z.string().url("programFileUrl must be a valid URL").optional(),
  resourceFile: base64File.nullable().optional(),
  resourceFileUrl: z.string().url("resourceFileUrl must be a valid URL").optional(),
  displayFile: base64File.nullable().optional(),
  displayFileUrl: z.string().url("displayFileUrl must be a valid URL").optional(),
}).refine(
  (data) => data.programFile || data.programFileUrl,
  { message: "Either programFile (base64) or programFileUrl (pre-signed URL) is required", path: ["programFile"] },
);

export type ProgramInput = z.infer<typeof programSchema>;

// ── Todos ────────────────────────────────────────────────────

const todoItem = z.object({
  title: z.string().min(1, "title is required"),
  description: z.string().nullable().optional(),
  category: z
    .enum([...TODO_CATEGORIES], {
      error: `category must be one of: ${TODO_CATEGORIES.join(", ")}`,
    })
    .default("morning-prep"),
  dueTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "dueTime must be HH:MM format")
    .nullable()
    .optional(),
  assignedRole: z.string().nullable().optional(),
  assignee: z.string().nullable().optional(),
  seat: z.string().nullable().optional(),
});

export const todosSchema = z.object({
  centreId: z.string().min(1, "centreId is required"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "Must be an ISO date (YYYY-MM-DD)")
    .optional()
    .default(() => new Date().toISOString().split("T")[0])
    .transform((v) => new Date(v))
    .refine((d) => !isNaN(d.getTime()), "Invalid date"),
  todos: z.array(todoItem).min(1, "At least one todo is required"),
});

export type TodosInput = z.infer<typeof todosSchema>;

export const todoUpdateSchema = z.object({
  completed: z.boolean(),
  completedBy: z.string().nullable().optional(),
});

export type TodoUpdateInput = z.infer<typeof todoUpdateSchema>;

// ── Announcements ────────────────────────────────────────────

export const announcementSchema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().min(1, "Body is required"),
  type: z.enum([...ANNOUNCEMENT_TYPES], {
    error: `Type must be one of: ${ANNOUNCEMENT_TYPES.join(", ")}`,
  }),
  targetCentres: z.array(z.string()).default(["all"]),
  attachments: z.array(z.string()).default([]),
  pinned: z.boolean().default(false),
  expiresAt: optionalIsoDate,
});

export type AnnouncementInput = z.infer<typeof announcementSchema>;

// ── Calendar Events ──────────────────────────────────────────

const calendarEventItem = z.object({
  title: z.string().min(1, "Title is required"),
  date: isoDateString,
  endDate: optionalIsoDate,
  centreId: z.string().nullable().optional(),
  type: z.enum([...EVENT_TYPES], {
    error: `Type must be one of: ${EVENT_TYPES.join(", ")}`,
  }),
  details: z.string().nullable().optional(),
});

export const calendarEventsSchema = z.object({
  events: z.array(calendarEventItem).min(1, "At least one event is required"),
});

export type CalendarEventsInput = z.infer<typeof calendarEventsSchema>;
