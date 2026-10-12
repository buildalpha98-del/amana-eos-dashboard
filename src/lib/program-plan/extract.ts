/**
 * Read a centre's monthly Program Plan PDF into weeks of activities and
 * meals (2026-10-12).
 *
 * The plans are designed pages — five day columns, rows for Rise and Shine,
 * Afternoon tea, Homework Heroes, Key program, Intentional teaching and Free
 * play. Extracted as text, the columns interleave and an afternoon's key
 * program can't be tied to its day (a closed Monday shifts everything left).
 * So Claude reads the PDF itself, page images and all, and returns the plan
 * through a forced tool call that is validated here before anything is saved.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DEFAULT_PROVIDER_MODEL } from "@/lib/ai-provider";

const day = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday"]);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const PROGRAMME_BRANDS = [
  "homework_heroes",
  "iqra_circle",
  "imagination_station",
  "little_champions",
  "fuel_up",
  "free_play",
] as const;

const activity = z.object({
  day,
  startTime: hhmm,
  endTime: hhmm,
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  programmeBrand: z.enum(PROGRAMME_BRANDS).optional(),
  mtopOutcomes: z.array(z.number().int().min(1).max(5)).max(5).optional(),
});

const meal = z.object({
  day,
  slot: z.enum(["breakfast", "morning_tea", "lunch", "afternoon_tea", "late_snack"]),
  description: z.string().min(1).max(1000),
});

const week = z.object({
  /** Monday of the week, YYYY-MM-DD — even when Monday is closed. */
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().max(200),
  question: z.string().max(300).optional(),
  closedDays: z.array(day).max(5).default([]),
  activities: z.array(activity).max(60),
  meals: z.array(meal).max(30),
});

export const programPlanSchema = z.object({ weeks: z.array(week).min(1).max(6) });
export type ProgramPlan = z.infer<typeof programPlanSchema>;
export type ProgramPlanWeek = ProgramPlan["weeks"][number];

const SYSTEM = `You read Amana OSHC weekly program plans (Outside School Hours Care, Australia) and return them as data.

Each page is one week: a header like "WEEKLY PROGRAM · TERM 4 · WEEK 1 · 12 TO 16 OCTOBER 2026", a week title and "Our question this week", then five day columns (Monday to Friday) with rows.

For every page return one week:
- weekStart: the Monday of that week as YYYY-MM-DD (use the year in the header), even if Monday is closed.
- title: the week's theme (e.g. "Welcome Back: My Story, Our Place"); question: the week's question.
- closedDays: days marked closed (e.g. "Closed today", "Term starts Tuesday"). Give closed days no activities and no meals.
- activities, for each open day, in this order where present:
  1. The Rise and Shine Club activity (before school care): title is the activity name, description its sentence. Time 07:00–08:15 unless a time is printed.
  2. Homework Heroes: 15:45–16:15 unless the cell gives another time (e.g. "Wed 4:15pm" means 16:15–16:45 on Wednesday).
  3. The Key program for that day (Little Champions Club, Imagination Station, Iqra Circle, Fuel Up with Amana): use its printed time; when only a start is printed, end 45 minutes later. Put the program name in the title, e.g. "Iqra Circle: Surah Quraysh".
  4. Intentional teaching (★ row): its title and sentence; if it is a safety drill with a time ("about 3:40pm") use that, otherwise 16:30–17:00.
  5. Free play and pack-up: 17:00–17:45, description from that day's cell.
  Map programmeBrand: Homework Heroes → homework_heroes, Iqra Circle → iqra_circle, Imagination Station → imagination_station, Little Champions Club → little_champions, Fuel Up with Amana → fuel_up, Free play → free_play.
  mtopOutcomes: the leading digit of each "Outcomes (MTOP)" code for that day (e.g. "3.2 healthy eating" → 3), unique, 1–5.
- meals, for each open day: breakfast from "Breakfast:" in the Rise and Shine cell; afternoon_tea from the Afternoon tea row; late_snack only if a specific food is named. Keep the wording as printed.

Columns are strictly Monday→Friday; when a day is closed its column is blank or says so — never shift another day's content into it. Do not invent activities, foods or times beyond the defaults above. Times are 24-hour HH:mm.`;

let _client: Anthropic | null = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured.");
  return (_client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
}

/** Monday check that doesn't depend on the server's time zone. */
function isMonday(iso: string) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;
}

export async function extractProgramPlan(pdf: Buffer, fileName: string): Promise<ProgramPlan> {
  const res = await client().messages.create({
    model: DEFAULT_PROVIDER_MODEL.showcase.modelId,
    max_tokens: 16_000,
    system: SYSTEM,
    tools: [
      {
        name: "save_program_plan",
        description: "Save the weeks read from the program plan.",
        input_schema: z.toJSONSchema(programPlanSchema) as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "save_program_plan" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") },
            title: fileName,
          },
          { type: "text", text: "Read every week in this program plan." },
        ],
      },
    ],
  });
  const call = res.content.find((b) => b.type === "tool_use");
  const parsed = programPlanSchema.safeParse(call && "input" in call ? call.input : null);
  if (!parsed.success) {
    throw new Error(`Couldn't read ${fileName} as a program plan.`);
  }
  const bad = parsed.data.weeks.find((w) => !isMonday(w.weekStart));
  if (bad) throw new Error(`${fileName}: week "${bad.title}" doesn't start on a Monday (${bad.weekStart}).`);
  return parsed.data;
}
