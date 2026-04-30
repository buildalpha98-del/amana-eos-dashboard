import { describe, it, expect } from "vitest";
import { parseQuiz, parseQuizQuestion, splitQuizQuestions } from "@/lib/quiz-parser";

describe("splitQuizQuestions", () => {
  it("splits on Q1 / Q2 / Q3 boundaries", () => {
    const content = "Q1: First?\nA: x\n\nQ2: Second?\nA: y\n\nQ3: Third?\nA: z";
    expect(splitQuizQuestions(content)).toHaveLength(3);
  });

  it("handles 'Question:' as well as 'Q1:'", () => {
    const content = "Question: Foo?\nA: bar\n\nQuestion: Baz?\nA: qux";
    expect(splitQuizQuestions(content)).toHaveLength(2);
  });

  it("filters empty chunks", () => {
    const content = "\n\nQ1: One?\nA: y\n\n\n\nQ2: Two?\nA: z\n\n";
    expect(splitQuizQuestions(content)).toHaveLength(2);
  });
});

describe("parseQuizQuestion — multiple choice format", () => {
  it("parses 4 options + correct marker + explanation", () => {
    const chunk = `Q1: What regulation covers food safety in OSHC?
A) Food Standards Code
B) Food Safety Standard 3.2.2A and Regulation 77 (correct)
C) Education and Care Services National Law
D) Public Health Act 2010
Explanation: NSW OSHC services are governed by FSS 3.2.2A.`;
    const result = parseQuizQuestion(chunk);
    expect(result.question).toBe("Q1: What regulation covers food safety in OSHC?");
    expect(result.options).toHaveLength(4);
    expect(result.options[1]).toEqual({
      letter: "B",
      text: "Food Safety Standard 3.2.2A and Regulation 77",
      isCorrect: true,
    });
    expect(result.options[0].isCorrect).toBe(false);
    expect(result.options[2].isCorrect).toBe(false);
    expect(result.options[3].isCorrect).toBe(false);
    expect(result.explanation).toBe("NSW OSHC services are governed by FSS 3.2.2A.");
    expect(result.legacyAnswer).toBeUndefined();
  });

  it("handles options without explanation", () => {
    const chunk = `Q2: Pick one.
A) First (correct)
B) Second
C) Third
D) Fourth`;
    const result = parseQuizQuestion(chunk);
    expect(result.options).toHaveLength(4);
    expect(result.options[0].isCorrect).toBe(true);
    expect(result.explanation).toBeUndefined();
  });

  it("uppercases letter labels regardless of input case", () => {
    const chunk = `Q3: Pick.
a) lower a
b) lower b (correct)`;
    const result = parseQuizQuestion(chunk);
    expect(result.options[0].letter).toBe("A");
    expect(result.options[1].letter).toBe("B");
  });

  it("captures multi-line explanation", () => {
    const chunk = `Q4: Explain.
A) Yes (correct)
B) No
Explanation: Line one of the explanation.
Line two continues the thought.`;
    const result = parseQuizQuestion(chunk);
    expect(result.explanation).toContain("Line one");
    expect(result.explanation).toContain("Line two");
  });

  it("ignores 'A: legacy answer' lines once MC options are present", () => {
    // Mixed format — options should win, legacy answer stays unset.
    const chunk = `Q5: Test.
A) Option (correct)
B) Other
A: This legacy line shouldn't be used.`;
    const result = parseQuizQuestion(chunk);
    expect(result.options).toHaveLength(2);
    expect(result.legacyAnswer).toBeUndefined();
  });
});

describe("parseQuizQuestion — legacy Q/A format", () => {
  it("parses single-line legacy answer", () => {
    const chunk = "Q1: Question?\nA: The answer.";
    const result = parseQuizQuestion(chunk);
    expect(result.options).toHaveLength(0);
    expect(result.legacyAnswer).toBe("The answer.");
  });

  it("captures multi-line legacy answer", () => {
    const chunk = "Q2: Multi?\nA: First line.\nSecond line of the answer.";
    const result = parseQuizQuestion(chunk);
    expect(result.options).toHaveLength(0);
    expect(result.legacyAnswer).toContain("First line.");
    expect(result.legacyAnswer).toContain("Second line");
  });

  it("returns empty fields for question-only chunks", () => {
    const chunk = "Q1: No answer?";
    const result = parseQuizQuestion(chunk);
    expect(result.options).toHaveLength(0);
    expect(result.legacyAnswer).toBeUndefined();
  });
});

describe("parseQuiz — end-to-end", () => {
  it("returns one QuizQuestion per chunk in order", () => {
    const content = `Q1: First?
A) Yes (correct)
B) No

Q2: Second?
A: Legacy answer text

Q3: Third?
A) X
B) Y (correct)`;
    const result = parseQuiz(content);
    expect(result).toHaveLength(3);
    expect(result[0].options).toHaveLength(2);
    expect(result[1].legacyAnswer).toBe("Legacy answer text");
    expect(result[2].options[1].isCorrect).toBe(true);
  });
});
