/**
 * Reading the files a family attached to their enrolment.
 *
 * The form has stored uploads in three different shapes over its life.
 * Reading only the current one means older families' birth certificates
 * silently vanish from both the parent portal and the staff child page —
 * and "no document" and "we can't read the document" look identical.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { enrolmentSubmission: { findUnique: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { enrolmentDocumentsFor } from "@/lib/enrolment-documents";

const mockPrisma = prisma as unknown as {
  enrolmentSubmission: { findUnique: ReturnType<typeof vi.fn> };
};

const CREATED = new Date("2026-07-01T00:00:00.000Z");

function seed(over: Record<string, unknown>) {
  mockPrisma.enrolmentSubmission.findUnique.mockResolvedValue({
    documentUploads: null,
    medicalFiles: null,
    courtOrderFiles: null,
    createdAt: CREATED,
    ...over,
  });
}

describe("enrolmentDocumentsFor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns nothing for a child added outside the form", async () => {
    // Normal case, not an error — staff add children directly.
    expect(await enrolmentDocumentsFor(null)).toEqual([]);
    expect(mockPrisma.enrolmentSubmission.findUnique).not.toHaveBeenCalled();
  });

  it("reads a bare array of URLs", async () => {
    seed({ documentUploads: ["https://blob.example/a.pdf"] });
    const docs = await enrolmentDocumentsFor("es-1");
    expect(docs).toHaveLength(1);
    expect(docs[0].fileUrl).toBe("https://blob.example/a.pdf");
  });

  it("reads an array of objects, keeping the supplied name", async () => {
    seed({
      documentUploads: [
        { url: "https://blob.example/b.pdf", name: "Bilal-birth-cert.pdf" },
      ],
    });
    const docs = await enrolmentDocumentsFor("es-1");
    expect(docs[0].fileName).toBe("Bilal-birth-cert.pdf");
  });

  it("reads the keyed shape and labels it for a human", async () => {
    // "birthCertificate" is not what staff should be reading on screen.
    seed({
      documentUploads: {
        birthCertificate: "https://blob.example/bc.pdf",
        immunisation: { url: "https://blob.example/imm.pdf" },
        photo: "https://blob.example/kid.jpg",
      },
    });
    const labels = (await enrolmentDocumentsFor("es-1")).map((d) => d.label);
    expect(labels).toContain("Birth certificate");
    expect(labels).toContain("Immunisation history");
    expect(labels).toContain("Photo of the child");
  });

  it("humanises a key it doesn't have a label for", async () => {
    seed({ documentUploads: { someOtherThing: "https://blob.example/x.pdf" } });
    const docs = await enrolmentDocumentsFor("es-1");
    expect(docs[0].label).toBe("Some other thing");
  });

  it("pulls from all three columns", async () => {
    seed({
      documentUploads: ["https://blob.example/a.pdf"],
      medicalFiles: ["https://blob.example/m.pdf"],
      courtOrderFiles: ["https://blob.example/c.pdf"],
    });
    expect(await enrolmentDocumentsFor("es-1")).toHaveLength(3);
  });

  it("shows a file filed in two columns once", async () => {
    // A court order commonly sits in both documentUploads and
    // courtOrderFiles. Listing it twice looks like two orders.
    seed({
      documentUploads: ["https://blob.example/order.pdf"],
      courtOrderFiles: ["https://blob.example/order.pdf"],
    });
    expect(await enrolmentDocumentsFor("es-1")).toHaveLength(1);
  });

  it("drops entries that aren't usable URLs", async () => {
    // A blank or relative value renders as a broken link, which reads as
    // "the document is corrupt" rather than "it was never supplied".
    seed({
      documentUploads: ["", "/uploads/local.pdf", null, { name: "no url" }],
    });
    expect(await enrolmentDocumentsFor("es-1")).toEqual([]);
  });

  it("survives an enrolment that no longer exists", async () => {
    mockPrisma.enrolmentSubmission.findUnique.mockResolvedValue(null);
    expect(await enrolmentDocumentsFor("gone")).toEqual([]);
  });
});
