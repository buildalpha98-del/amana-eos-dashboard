/**
 * What a family is told their enrolment is doing.
 *
 * `EnrolmentSubmission.status` is a plain `String` column, and three
 * places kept their own idea of its vocabulary: the PATCH route's zod
 * enum, this file's access gates, and the public status page's own map.
 *
 * The page's copy had drifted furthest. It named `reviewing` and
 * `needs_info`, which no writer has ever produced, and omitted
 * `under_review` and `archived`, which the PATCH route does produce.
 * Both fell through its `|| STATUS_MAP.submitted` fallback — so an
 * ARCHIVED enrolment told the family it was under review. Not a missing
 * answer, a wrong one.
 */
import { describe, it, expect } from "vitest";
import { enrolmentStatusDisplay } from "@/lib/parent-enrolment-state";

/** Exactly what PATCH /api/enrolments/[id] accepts. */
const WRITTEN_STATUSES = [
  "submitted",
  "under_review",
  "processed",
  "rejected",
  "archived",
];

describe("enrolmentStatusDisplay", () => {
  it("has a label for every status the API can write", () => {
    // The drift this closes: the page mapped statuses nobody writes and
    // missed ones the API does.
    for (const status of WRITTEN_STATUSES) {
      expect(
        enrolmentStatusDisplay(status).label,
        `no label for "${status}"`,
      ).toBeTruthy();
    }
  });

  it("stops telling an archived family they're under review", () => {
    const archived = enrolmentStatusDisplay("archived");
    expect(archived.label).toBe("Closed");
    expect(archived.label).not.toBe(enrolmentStatusDisplay("under_review").label);
  });

  it("distinguishes received from actually being reviewed", () => {
    // "submitted" used to read "Under Review", which claimed more than
    // had happened.
    expect(enrolmentStatusDisplay("submitted").label).toBe("Received");
    expect(enrolmentStatusDisplay("under_review").label).toBe("Under Review");
  });

  it("says confirmed only when staff have confirmed it", () => {
    expect(enrolmentStatusDisplay("processed").label).toBe("Confirmed");
    expect(enrolmentStatusDisplay("rejected").label).toBe("Not Proceeding");
  });

  it("commits to nothing for a status it doesn't know", () => {
    // Defaulting to a specific state is how "archived" came to read as
    // "under review" in the first place.
    const unknown = enrolmentStatusDisplay("something_new");
    expect(unknown.label).toBe("Received");
    expect(unknown.color).not.toBe(enrolmentStatusDisplay("processed").color);
  });

  it("handles a missing status without throwing", () => {
    expect(enrolmentStatusDisplay(null).label).toBeTruthy();
    expect(enrolmentStatusDisplay(undefined).label).toBeTruthy();
  });

  it("keeps the tolerated synonyms in the right bucket", () => {
    // Same defensive posture as APPROVED_STATUSES: no writer produces
    // these today, and if one ever does the family should read
    // something true rather than fall through to the default.
    expect(enrolmentStatusDisplay("approved").label).toBe("Confirmed");
    expect(enrolmentStatusDisplay("active").label).toBe("Confirmed");
    expect(enrolmentStatusDisplay("in_review").label).toBe("Under Review");
    expect(enrolmentStatusDisplay("processing").label).toBe("Under Review");
  });
});
