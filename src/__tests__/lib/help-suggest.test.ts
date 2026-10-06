import { describe, it, expect } from "vitest";
import {
  excerpt,
  keywords,
  markdownToPlain,
  suggestArticles,
} from "@/lib/help-suggest";

const A = (title: string, body = "") => ({ id: title, slug: title, title, body });
const ARTICLES = [
  A("How do I book a casual day?", "Casual days are booked in **OWNA**."),
  A("I haven't received my OWNA login details", "Check your junk folder."),
  A("My child will be absent — what do I need to do?", "Mark the absence in OWNA."),
  A("Is the food halal? What about allergies?", "All food is halal."),
  A("How and when am I billed?", "Fees are debited fortnightly for your child."),
];

describe("suggestArticles", () => {
  it("matches a question phrased differently from the title", () => {
    // The public search matched the WHOLE phrase, so this found nothing.
    const [top] = suggestArticles(ARTICLES, "how can I book casual days for my son");
    expect(top.title).toBe("How do I book a casual day?");
  });

  it("finds the login answer from a typical message", () => {
    const [top] = suggestArticles(ARTICLES, "Hi, I never got my login for OWNA");
    expect(top.title).toMatch(/OWNA login/);
  });

  it("stays quiet on a message with nothing to match", () => {
    expect(suggestArticles(ARTICLES, "Thank you so much, salam")).toEqual([]);
  });

  it("won't present one incidental word as a match", () => {
    // "child" appears everywhere; on its own it's noise, not an answer.
    expect(suggestArticles(ARTICLES, "my child")).toEqual([]);
  });

  it("caps the number of suggestions", () => {
    expect(suggestArticles(ARTICLES, "owna", { limit: 1, minScore: 1 })).toHaveLength(1);
  });
});

describe("keywords", () => {
  it("drops stopwords and folds plurals", () => {
    expect(keywords("How do I change my bookings?")).toEqual(["change", "booking"]);
  });
});

describe("markdownToPlain", () => {
  it("turns markdown into a message staff can send as-is", () => {
    const plain = markdownToPlain(
      "## Heading\n\nBook in **OWNA** — see [our guide](https://x.test/g).\n\n\n\n- one",
    );
    expect(plain).toBe("Heading\n\nBook in OWNA — see our guide (https://x.test/g).\n\n- one");
  });
});

describe("excerpt", () => {
  it("cuts on a word boundary", () => {
    expect(excerpt("one two three four", 9)).toBe("one two…");
  });
});
