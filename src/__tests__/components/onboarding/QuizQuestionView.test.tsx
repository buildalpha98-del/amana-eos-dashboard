// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuizQuestionView } from "@/components/onboarding/QuizQuestionView";

describe("QuizQuestionView — multi-choice", () => {
  const mcQuestion = {
    question: "Q1: What regulation covers food safety?",
    options: [
      { letter: "A", text: "Local bylaws", isCorrect: false },
      { letter: "B", text: "Food Safety Standard 3.2.2A", isCorrect: true },
      { letter: "C", text: "Education Act", isCorrect: false },
      { letter: "D", text: "None of the above", isCorrect: false },
    ],
    explanation: "NSW OSHC services use FSS 3.2.2A.",
  };

  it("renders all 4 options", () => {
    render(<QuizQuestionView questionKey="k" question={mcQuestion} />);
    expect(screen.getByText(/Local bylaws/)).toBeTruthy();
    expect(screen.getByText(/Food Safety Standard 3\.2\.2A/)).toBeTruthy();
    expect(screen.getByText(/Education Act/)).toBeTruthy();
  });

  it("Submit is disabled until an option is selected", () => {
    render(<QuizQuestionView questionKey="k" question={mcQuestion} />);
    const submit = screen.getByRole("button", { name: /Submit/i });
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Local bylaws/i }));
    expect(submit.hasAttribute("disabled")).toBe(false);
  });

  it("answers are NOT visible before submit (no explanation, no correct/incorrect)", () => {
    render(<QuizQuestionView questionKey="k" question={mcQuestion} />);
    expect(screen.queryByText(/NSW OSHC services use/)).toBeNull();
    expect(screen.queryByText(/Correct$/)).toBeNull();
    expect(screen.queryByText(/Incorrect/)).toBeNull();
  });

  it("shows 'Correct' and explanation when the right option is submitted", () => {
    render(<QuizQuestionView questionKey="k" question={mcQuestion} />);
    fireEvent.click(
      screen.getByRole("radio", { name: /Food Safety Standard 3\.2\.2A/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));
    expect(screen.getByText("Correct")).toBeTruthy();
    expect(screen.getByText(/NSW OSHC services use/)).toBeTruthy();
  });

  it("shows 'Incorrect' + correct letter when the wrong option is submitted", () => {
    render(<QuizQuestionView questionKey="k" question={mcQuestion} />);
    fireEvent.click(screen.getByRole("radio", { name: /Local bylaws/i }));
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));
    expect(screen.getByText(/Incorrect — answer: B/)).toBeTruthy();
    expect(screen.getByText(/NSW OSHC services use/)).toBeTruthy();
  });

  it("Try again resets to pre-submit state", () => {
    render(<QuizQuestionView questionKey="k" question={mcQuestion} />);
    fireEvent.click(screen.getByRole("radio", { name: /Local bylaws/i }));
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(screen.queryByText(/Incorrect/)).toBeNull();
    expect(screen.queryByText(/NSW OSHC services use/)).toBeNull();
    expect(
      screen.getByRole("button", { name: /Submit/i }).hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("QuizQuestionView — legacy Q/A fallback", () => {
  const legacyQuestion = {
    question: "Q1: What is the answer?",
    options: [],
    legacyAnswer: "The answer is 42.",
  };

  it("hides the legacy answer until the toggle is clicked", () => {
    render(<QuizQuestionView questionKey="k" question={legacyQuestion} />);
    expect(screen.queryByText(/answer is 42/)).toBeNull();
    expect(screen.getByRole("button", { name: /Show Answer/i })).toBeTruthy();
  });

  it("reveals the answer when the toggle is clicked", () => {
    render(<QuizQuestionView questionKey="k" question={legacyQuestion} />);
    fireEvent.click(screen.getByRole("button", { name: /Show Answer/i }));
    expect(screen.getByText(/answer is 42/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Hide Answer/i })).toBeTruthy();
  });
});

describe("QuizQuestionView — empty (no answer)", () => {
  it("just renders the question with no toggle or radio", () => {
    const q = { question: "Q1: Just asking?", options: [] };
    render(<QuizQuestionView questionKey="k" question={q} />);
    expect(screen.getByText("Q1: Just asking?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show Answer/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Submit/i })).toBeNull();
  });
});
