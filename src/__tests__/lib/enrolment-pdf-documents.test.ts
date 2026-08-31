/**
 * What the printed enrolment says about the documents a family gave us.
 *
 * Nothing, before this. `medicalFiles` and `courtOrderFiles` were
 * declared on the PDF's own interface and never rendered, and
 * `documentUploads` — birth certificates, immunisation records — wasn't
 * declared at all. The route passes the row through as `any`, so the
 * missing field type-checked and vanished.
 *
 * The result was an enrolment pack that recorded no evidence of an
 * immunisation history or an anaphylaxis action plan however many the
 * family had uploaded, on the artefact staff check and file.
 */
import { describe, it, expect } from "vitest";
import { documentRows } from "@/lib/enrolment-pdf";

const children = [
  { firstName: "Aysha", surname: "Khan" },
  { firstName: "Mo", surname: "Ali" },
];

describe("documentRows", () => {
  it("lists a document the pack never used to mention", () => {
    const rows = documentRows({
      children,
      documentUploads: [
        {
          childIndex: 0,
          type: "immunisation_record",
          filename: "aysha-immunisation.pdf",
        },
      ],
    });
    expect(rows).toEqual([
      {
        label: "Immunisation record — Aysha Khan",
        filename: "aysha-immunisation.pdf",
      },
    ]);
  });

  it("draws from all three upload fields", () => {
    // They're three shapes of the same thing, split by the submit
    // route. A pack that showed one and not the others would be a
    // subtler version of the same bug.
    const rows = documentRows({
      children,
      documentUploads: [{ childIndex: 0, type: "birth_certificate", filename: "a.pdf" }],
      medicalFiles: [{ childIndex: 1, type: "medical_action_plan", filename: "b.pdf" }],
      courtOrderFiles: [{ type: "court_order", filename: "c.pdf" }],
    });
    expect(rows.map((r) => r.filename)).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
  });

  it("says whose document it is", () => {
    // "We have an action plan" is only useful when you know for whom.
    const rows = documentRows({
      children,
      medicalFiles: [
        { childIndex: 1, type: "medical_action_plan", filename: "mo.pdf" },
      ],
    });
    expect(rows[0].label).toBe("Medical action plan — Mo Ali");
  });

  it("leaves a household document unattributed rather than guessing", () => {
    const rows = documentRows({
      children,
      courtOrderFiles: [{ type: "court_order", filename: "order.pdf" }],
    });
    expect(rows[0].label).toBe("Court order");
  });

  it("doesn't attribute to a child index that isn't there", () => {
    // A stale index shouldn't put one family's document under another
    // child's name.
    const rows = documentRows({
      children,
      documentUploads: [{ childIndex: 9, type: "birth_certificate", filename: "x.pdf" }],
    });
    expect(rows[0].label).toBe("Birth certificate");
  });

  it("names an untyped file something rather than nothing", () => {
    const rows = documentRows({
      children,
      documentUploads: [{ childIndex: 0, filename: "scan.pdf" }],
    });
    expect(rows[0].label).toBe("Document — Aysha Khan");
  });

  it("marks a file with no filename instead of printing a blank row", () => {
    const rows = documentRows({
      children,
      documentUploads: [{ childIndex: 0, type: "birth_certificate" }],
    });
    expect(rows[0].filename).toBe("(unnamed file)");
  });

  it("returns nothing when a family uploaded nothing", () => {
    // The caller only draws the heading when there are rows, so an
    // empty list must stay empty rather than becoming one blank entry.
    expect(documentRows({ children })).toEqual([]);
  });
});

/**
 * Regression: opening an enrolment PDF returned
 * `{"error":"Internal server error"}`.
 *
 * These are `Json` columns and the route reaches them through an
 * `as any`, so the declared array types are a hope rather than a
 * guarantee. Spreading a non-array threw "is not iterable", which had
 * no try/catch above it — so a field that only DECORATES the document
 * took the whole document down, and the 500 named neither the
 * submission nor the field.
 */
describe("documentRows — untrusted JSON columns", () => {
  it("survives an object where an array was declared", () => {
    expect(() =>
      documentRows({
        children,
        documentUploads: {} as never,
      }),
    ).not.toThrow();
  });

  it("survives a keyed object", () => {
    const rows = documentRows({
      children,
      medicalFiles: { "0": { filename: "a.pdf" } } as never,
    });
    expect(rows).toEqual([]);
  });

  it("does not shred a string into one-character files", () => {
    // The nastier case: `[..."none"]` doesn't throw, it yields four
    // single-character entries. A guard that only caught throws would
    // have printed four fake documents onto the pack.
    const rows = documentRows({ children, documentUploads: "none" as never });
    expect(rows).toEqual([]);
  });

  it("drops non-object entries inside an otherwise valid array", () => {
    const rows = documentRows({
      children,
      documentUploads: [
        null,
        "junk",
        { childIndex: 0, type: "birth_certificate", filename: "real.pdf" },
      ] as never,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].filename).toBe("real.pdf");
  });

  it("survives children not being an array either", () => {
    const rows = documentRows({
      children: {} as never,
      documentUploads: [{ childIndex: 0, type: "birth_certificate", filename: "a.pdf" }],
    });
    expect(rows[0].label).toBe("Birth certificate");
  });

  it("still renders the valid uploads when one column is malformed", () => {
    // A bad value in one column must not hide the documents in another.
    const rows = documentRows({
      children,
      documentUploads: {} as never,
      medicalFiles: [
        { childIndex: 0, type: "medical_action_plan", filename: "plan.pdf" },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Medical action plan — Aysha Khan");
  });
});
