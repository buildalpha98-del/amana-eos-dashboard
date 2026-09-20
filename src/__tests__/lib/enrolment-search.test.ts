import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { searchEnrolmentIds, ENROLMENT_SEARCH_CAP } from "@/lib/enrolment-search";

/**
 * `$queryRaw` is a tagged template, so the mock receives
 * (templateStrings, ...interpolatedValues). The SQL text is the first
 * argument; everything the caller interpolated follows it as bound
 * parameters — which is exactly what these assertions inspect.
 */
function lastCall() {
  const call = prismaMock.$queryRaw.mock.calls.at(-1)!;
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];

  /*
   * Conditional clauses are nested `Prisma.sql` fragments, so they arrive as
   * Sql objects carrying their OWN strings and values rather than as plain
   * bound parameters. Flattening one level keeps the assertions about what
   * actually reaches Postgres rather than about the shape of the builder.
   */
  const sqlParts = [Array.from(strings).join("?")];
  const flatValues: unknown[] = [];
  for (const v of values) {
    const frag = v as { strings?: readonly string[]; values?: unknown[] };
    if (frag && Array.isArray(frag.strings)) {
      sqlParts.push(frag.strings.join("?"));
      flatValues.push(...(frag.values ?? []));
    } else {
      flatValues.push(v);
    }
  }

  return { sql: sqlParts.join(" "), values: flatValues };
}

describe("searchEnrolmentIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([{ id: "es-1" }, { id: "es-2" }]);
  });

  it("returns the matching ids", async () => {
    await expect(searchEnrolmentIds("rahman")).resolves.toEqual(["es-1", "es-2"]);
  });

  it("does not hit the database for an empty or whitespace term", async () => {
    await expect(searchEnrolmentIds("")).resolves.toEqual([]);
    await expect(searchEnrolmentIds("   ")).resolves.toEqual([]);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it("wraps the term in wildcards and binds it as a parameter", async () => {
    await searchEnrolmentIds("Rahman");
    const { values } = lastCall();
    expect(values).toContain("%Rahman%");
    // Bound, never concatenated — the term must not reach the SQL text.
    expect(lastCall().sql).not.toContain("Rahman");
  });

  it("escapes LIKE metacharacters so they match literally", async () => {
    // A surname with an underscore would otherwise become a single-character
    // wildcard, and a stray % would match the whole table.
    await searchEnrolmentIds("a_b%c");
    expect(lastCall().values).toContain("%a\\_b\\%c%");
  });

  it("searches parent names, email, mobile and CHILD names", async () => {
    await searchEnrolmentIds("yusuf");
    const { sql } = lastCall();
    expect(sql).toContain(`"primaryParent"->>'firstName'`);
    expect(sql).toContain(`"primaryParent"->>'surname'`);
    expect(sql).toContain(`"primaryParent"->>'email'`);
    expect(sql).toContain(`"primaryParent"->>'mobile'`);
    expect(sql).toContain(`"secondaryParent"->>'surname'`);
    // The child-name reach is the whole reason this isn't a Prisma JSON
    // filter — staff search for the child they were just speaking about.
    expect(sql).toContain(`jsonb_array_elements("children")`);
  });

  it("guards against a children column that isn't an array", async () => {
    // One malformed record must not turn every search into a 500.
    await searchEnrolmentIds("anything");
    expect(lastCall().sql).toContain(`jsonb_typeof("children") = 'array'`);
  });

  it("caps the candidate set", async () => {
    await searchEnrolmentIds("a");
    expect(lastCall().values).toContain(ENROLMENT_SEARCH_CAP);
  });

  it("binds a serviceId when the caller is centre-scoped", async () => {
    await searchEnrolmentIds("rahman", "svc-1");
    expect(lastCall().values).toContain("svc-1");
  });

  it("omits the service clause entirely for an unscoped (admin) caller", async () => {
    await searchEnrolmentIds("rahman");
    expect(lastCall().values).not.toContain("svc-1");
  });
});
