/**
 * Files a family attached to their enrolment form.
 *
 * They live on the SUBMISSION as JSON — `documentUploads`, `medicalFiles`,
 * `courtOrderFiles` — rather than as ChildDocument rows, so anything that
 * lists ChildDocuments shows none of them. Both the parent portal and the
 * staff child page need them, and they need to agree, so the reader lives
 * here rather than being written twice.
 *
 * The form has stored uploads in more than one shape over its life: a
 * bare array of URLs, an array of objects, and a keyed object of either.
 * All three are read, or older families' documents silently disappear.
 */
import { prisma } from "@/lib/prisma";

export interface EnrolmentDoc {
  id: string;
  label: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: Date;
}

/** Human labels for the keyed shape, so "birthCert" isn't what staff read. */
const KEY_LABELS: Record<string, string> = {
  birthCertificate: "Birth certificate",
  birthCert: "Birth certificate",
  immunisation: "Immunisation history",
  immunisationRecord: "Immunisation history",
  photo: "Photo of the child",
  childPhoto: "Photo of the child",
  courtOrder: "Court order",
  actionPlan: "Medical action plan",
  medical: "Medical document",
};

function labelFor(key?: string, fallback = "Enrolment document"): string {
  if (!key) return fallback;
  return KEY_LABELS[key] ?? humanise(key);
}

/**
 * "someOtherThing" → "Some other thing".
 *
 * Sentence case, not Title Case, so an unlabelled key sits beside the
 * curated ones ("Birth certificate", "Immunisation history") without
 * looking like a different kind of thing.
 */
function humanise(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function collect(
  raw: unknown,
  fallbackLabel: string,
  out: { url: string; name?: string; label: string }[],
): void {
  const take = (v: unknown, key?: string) => {
    if (typeof v === "string" && /^https?:\/\//.test(v)) {
      out.push({ url: v, label: labelFor(key, fallbackLabel) });
      return;
    }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url : null;
      if (!url || !/^https?:\/\//.test(url)) return;
      out.push({
        url,
        name: typeof o.name === "string" ? o.name : undefined,
        label:
          typeof o.label === "string" && o.label
            ? o.label
            : labelFor(key, fallbackLabel),
      });
    }
  };

  if (Array.isArray(raw)) {
    for (const v of raw) take(v);
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(v)) for (const item of v) take(item, k);
      else take(v, k);
    }
  }
}

/**
 * Every file attached to an enrolment, labelled for a human.
 *
 * Returns [] for a child with no enrolment — a child added directly by
 * staff rather than through the form is a normal case, not an error.
 */
export async function enrolmentDocumentsFor(
  enrolmentId: string | null | undefined,
): Promise<EnrolmentDoc[]> {
  if (!enrolmentId) return [];

  const sub = await prisma.enrolmentSubmission.findUnique({
    where: { id: enrolmentId },
    select: {
      documentUploads: true,
      medicalFiles: true,
      courtOrderFiles: true,
      createdAt: true,
    },
  });
  if (!sub) return [];

  const found: { url: string; name?: string; label: string }[] = [];
  collect(sub.documentUploads, "Enrolment document", found);
  collect(sub.medicalFiles, "Medical document", found);
  collect(sub.courtOrderFiles, "Court order", found);

  // The same file can appear in more than one blob (a court order filed
  // under both documentUploads and courtOrderFiles). Show it once.
  const seen = new Set<string>();
  return found
    .filter((f) => (seen.has(f.url) ? false : (seen.add(f.url), true)))
    .map((f) => ({
      id: `enrol:${f.url}`,
      label: f.label,
      fileName: f.name || f.label,
      fileUrl: f.url,
      uploadedAt: sub.createdAt,
    }));
}
