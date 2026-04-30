/**
 * Quiz content parser — supports two formats:
 *
 *   1. **Multi-choice (preferred)** — each question has labelled options
 *      and one is marked `(correct)`. Optional `Explanation:` line shows
 *      after the user submits.
 *
 *      ```
 *      Q1: What regulation covers food safety in OSHC?
 *      A) Food Standards Code
 *      B) Food Safety Standard 3.2.2A and Regulation 77 (correct)
 *      C) Education and Care Services National Law
 *      D) Public Health Act 2010
 *      Explanation: NSW OSHC services are governed by Food Safety Standard
 *      3.2.2A under the Australia New Zealand Food Standards Code.
 *      ```
 *
 *   2. **Legacy Q/A (read-only fallback)** — single freeform answer hidden
 *      behind a "Show Answer" toggle. Pre-2026-04-29 quizzes used this
 *      format and continue to render unchanged when the parser sees no
 *      multi-choice options.
 *
 *      ```
 *      Q1: What regulation covers food safety in OSHC?
 *      A: Food Safety Standard 3.2.2A and Regulation 77
 *      ```
 *
 * Questions are delimited by `\n(?=Q\d|Question)`. Whitespace lines and
 * the `?` marker on the question are preserved.
 */

export interface QuizOption {
  /** Letter label as authored, e.g. "A". Always uppercased. */
  letter: string;
  /** Option text with `(correct)` marker stripped. */
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestion {
  /** The full first line of the chunk — usually starts "Q1:" or "Question:". */
  question: string;
  /** Empty when the chunk is in legacy Q/A form. */
  options: QuizOption[];
  /** Shown post-submit. Multi-choice format only. */
  explanation?: string;
  /** Legacy single-answer text. Only set when options is empty. */
  legacyAnswer?: string;
}

const OPTION_RE = /^([A-D])\)\s*(.+?)(?:\s*\((correct)\)\s*)?$/i;
const EXPLANATION_RE = /^Explanation:\s*(.*)$/i;
const LEGACY_ANSWER_RE = /^A:\s*(.*)$/i;

/** Split full quiz content into per-question chunks. */
export function splitQuizQuestions(content: string): string[] {
  return content
    .split(/\n(?=Q\d|Question)/i)
    .map((q) => q.trim())
    .filter((q) => q.length > 0);
}

/** Parse a single chunk into a QuizQuestion. */
export function parseQuizQuestion(chunk: string): QuizQuestion {
  const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { question: "", options: [] };
  }

  const question = lines[0];
  const options: QuizOption[] = [];
  let explanation: string | undefined;
  let legacyAnswerLines: string[] = [];
  let inExplanation = false;

  for (const line of lines.slice(1)) {
    const optMatch = line.match(OPTION_RE);
    if (optMatch) {
      const [, letter, text, correctMarker] = optMatch;
      options.push({
        letter: letter.toUpperCase(),
        text: text.trim(),
        isCorrect: Boolean(correctMarker),
      });
      inExplanation = false;
      continue;
    }
    const expMatch = line.match(EXPLANATION_RE);
    if (expMatch) {
      explanation = expMatch[1];
      inExplanation = true;
      continue;
    }
    const ansMatch = line.match(LEGACY_ANSWER_RE);
    if (ansMatch && options.length === 0) {
      // Legacy "A: ..." answer line. Only honoured when no MC options seen.
      legacyAnswerLines.push(ansMatch[1]);
      continue;
    }
    // Continuation line for explanation or legacy answer.
    if (inExplanation && explanation !== undefined) {
      explanation = `${explanation}\n${line}`.trim();
    } else if (legacyAnswerLines.length > 0) {
      legacyAnswerLines.push(line);
    }
  }

  return {
    question,
    options,
    explanation,
    legacyAnswer:
      options.length === 0 && legacyAnswerLines.length > 0
        ? legacyAnswerLines.join("\n")
        : undefined,
  };
}

/** Convenience: parse the whole quiz content blob into ordered questions. */
export function parseQuiz(content: string): QuizQuestion[] {
  return splitQuizQuestions(content).map(parseQuizQuestion);
}
