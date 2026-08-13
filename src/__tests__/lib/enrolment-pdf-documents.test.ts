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
