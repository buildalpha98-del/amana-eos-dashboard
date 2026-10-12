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

/** One forced, schema-checked tool call over a PDF. */
async function readPdf<T>(
  pdf: Buffer,
  fileName: string,
  system: string,
  schema: z.ZodType<T>,
  ask: string,
  more: { pdf: Buffer; fileName: string }[] = [],
): Promise<T> {
  const res = await client().messages.create({
    model: DEFAULT_PROVIDER_MODEL.showcase.modelId,
    max_tokens: 16_000,
    system,
    tools: [
      {
        name: "save",
        description: "Save what was read from the document.",
        input_schema: z.toJSONSchema(schema) as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "save" },
    messages: [
      {
        role: "user",
        content: [
          ...[{ pdf, fileName }, ...more].map((d) => ({
            type: "document" as const,
            source: { type: "base64" as const, media_type: "application/pdf" as const, data: d.pdf.toString("base64") },
            title: d.fileName,
          })),
          { type: "text", text: ask },
        ],
      },
    ],
  });
  const call = res.content.find((b) => b.type === "tool_use");
  const parsed = schema.safeParse(call && "input" in call ? call.input : null);
  if (!parsed.success) throw new Error(`Couldn't read ${fileName}.`);
  return parsed.data;
}

export async function extractProgramPlan(pdf: Buffer, fileName: string): Promise<ProgramPlan> {
  const plan = await readPdf(pdf, fileName, SYSTEM, programPlanSchema, "Read every week in this program plan.");
  const bad = plan.weeks.find((w) => !isMonday(w.weekStart));
  if (bad) throw new Error(`${fileName}: week "${bad.title}" doesn't start on a Monday (${bad.weekStart}).`);
  return plan;
}

// ── Menus ───────────────────────────────────────────────────────────────
// Each centre's "Fuel Up with Amana · Weekly menu" PDF: one page per week,
// breakfast and afternoon tea per day with allergen codes (M milk, W wheat
// or gluten, Sy soy…), dairy-free / sesame-free alternatives, and one late
// snack for the week. When a centre has this file it is the menu — the
// program plan's food lines are only a summary of it.

/** The menu editor's allergen chips, so imported flags show the same way. */
export const MENU_ALLERGENS = ["dairy", "gluten", "soy", "eggs", "nuts", "sesame", "shellfish", "fish", "lupin"] as const;

const menuWeek = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  closedDays: z.array(day).max(5).default([]),
  meals: z
    .array(
      z.object({
        day,
        slot: z.enum(["breakfast", "morning_tea", "lunch", "afternoon_tea", "late_snack"]),
        description: z.string().min(1).max(1000),
        allergens: z.array(z.enum(MENU_ALLERGENS)).max(9).default([]),
      }),
    )
    .max(40),
});
export const menuPlanSchema = z.object({ weeks: z.array(menuWeek).min(1).max(6) });
export type MenuPlan = z.infer<typeof menuPlanSchema>;
export type MenuPlanWeek = MenuPlan["weeks"][number];

const MENU_SYSTEM = `You read Amana OSHC weekly menus (Outside School Hours Care, Australia) and return them as data.

Each page is one week ("Week 1 menu · 12 to 16 October 2026") with a row per day: the Rise and Shine Club breakfast, the Amana Afternoons afternoon tea, sometimes an "Alternative" line, and allergen codes after each dish. A "Late snack" line applies to every open day of that week.

For every page return one week:
- weekStart: the Monday of that week as YYYY-MM-DD.
- closedDays: days marked closed or with no food listed for them.
- meals for each open day:
  - breakfast: the breakfast dish exactly as printed.
  - afternoon_tea: the afternoon tea dish as printed; prefix "Cooking: " or a special-day label (e.g. "World Food Day: ") when printed. If there is an "Alternative" line, append it in brackets, e.g. "(Dairy-free: fruit kebabs without dip)".
  - late_snack: the week's late snack, on every open day.
  - allergens: map each dish's codes using the page's allergen key: M → dairy, W → gluten, Sy → soy, E → eggs, N → nuts, Se or S (sesame) → sesame. "may contain" codes count. Use only these words.
Do not invent dishes. Ignore delivery, stock and allergy-rule notes.`;

export async function extractMenu(pdf: Buffer, fileName: string): Promise<MenuPlan> {
  const menu = await readPdf(pdf, fileName, MENU_SYSTEM, menuPlanSchema, "Read every week in this menu.");
  const bad = menu.weeks.find((w) => !isMonday(w.weekStart));
  if (bad) throw new Error(`${fileName}: a week doesn't start on a Monday (${bad.weekStart}).`);
  return menu;
}

// ── Activity Library ────────────────────────────────────────────────────
// Program-plan activities become reusable library entries (Daniel,
// 2026-10-12): name, resources needed, how to run it, MTOP outcomes. The
// plan gives the name, what children do and the outcomes; the Centre
// Insert's materials checklist names the activity each item is "used for".
// The how-to is drafted from those and labelled as drafted.

export const ACTIVITY_CATEGORIES = [
  "physical_play", "creative_arts", "music_movement", "literacy", "numeracy",
  "nature_outdoors", "cooking_nutrition", "social_emotional", "quiet_time",
  "free_play", "quran_iqra", "homework_help", "stem_science", "other",
] as const;

export const libraryDetailsSchema = z.object({
  activities: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        resourcesNeeded: z.string().max(2000),
        howTo: z.string().min(1).max(5000),
        category: z.enum(ACTIVITY_CATEGORIES),
        durationMinutes: z.number().int().min(5).max(240).optional(),
      }),
    )
    .max(60),
});
export type LibraryDetails = z.infer<typeof libraryDetailsSchema>["activities"];

const LIBRARY_SYSTEM = `You prepare entries for Amana OSHC's Activity Library — reusable activities for Outside School Hours Care (school-age children, 5–12) that educators at any centre can pick up and run.

You get a monthly program plan and, when there is one, the Centre Insert (its materials checklist lists each item with the activity it is "used for"). For EACH activity title you are given, return:
- title: exactly as given.
- resourcesNeeded: the materials for that activity, one per line ("- 20 blunt lollipop sticks"), taken from the materials checklist and the plan. Include food items for cooking activities. If nothing is listed, give the obvious basics only (e.g. "- Paper and coloured pencils") — never invent specialist equipment.
- howTo: how to run it, as 4–8 short numbered steps an educator can follow, including any safety point that matters (handwashing before cooking, allergy check before food, cones and space for active games, an educator at the table for cooking). Base it on what the plan says children do. Warm, plain Australian English.
- category: the closest of: physical_play, creative_arts, music_movement, literacy, numeracy, nature_outdoors, cooking_nutrition, social_emotional, quiet_time, free_play, quran_iqra, homework_help, stem_science, other.
- durationMinutes: from the plan's times if shown.
Return only the titles you were given.`;

export async function extractLibraryDetails(
  plan: { pdf: Buffer; fileName: string },
  insert: { pdf: Buffer; fileName: string } | null,
  activities: { title: string; description?: string | null }[],
): Promise<LibraryDetails> {
  const list = activities.map((a) => `- ${a.title}${a.description ? `: ${a.description}` : ""}`).join("\n");
  const out = await readPdf(
    plan.pdf,
    plan.fileName,
    LIBRARY_SYSTEM,
    libraryDetailsSchema,
    `Prepare library entries for these activities:\n${list}`,
    insert ? [insert] : [],
  );
  return out.activities;
}
