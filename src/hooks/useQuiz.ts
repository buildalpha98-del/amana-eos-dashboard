"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface ShuffledQuizQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface StartQuizResponse {
  attemptId: string;
  attemptNumber: number;
  questions: ShuffledQuizQuestion[];
}

export interface SubmitQuizResponse {
  score: number;
  passed: boolean;
  results: { questionId: string; correct: boolean; correctIndex: number }[];
  explanations: { questionId: string; correctIndex: number; explanation: string | null }[];
}

/** Start a fresh attempt (fetches shuffled questions — no correct answers). */
export function useStartQuiz() {
  return useMutation({
    mutationFn: async (moduleId: string) =>
      fetchApi<StartQuizResponse>(`/api/lms/modules/${moduleId}/quiz`),
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

/** Submit an attempt for server-side scoring. */
export function useSubmitQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      moduleId: string;
      attemptId: string;
      answers: { questionId: string; selectedIndex: number }[];
    }) =>
      mutateApi<SubmitQuizResponse>(`/api/lms/modules/${input.moduleId}/quiz`, {
        method: "POST",
        body: { attemptId: input.attemptId, answers: input.answers },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-enrollments"] });
      qc.invalidateQueries({ queryKey: ["induction-readiness"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

/** Admin: list a module's quiz questions (authoring view — includes answers). */
export function useModuleQuestions(moduleId: string | undefined) {
  return useQuery({
    queryKey: ["quiz-questions", moduleId],
    enabled: !!moduleId,
    staleTime: 30_000,
    retry: 2,
    queryFn: async () =>
      fetchApi<
        {
          id: string;
          question: string;
          options: string[];
          correctIndex: number;
          explanation: string | null;
          sortOrder: number;
          active: boolean;
        }[]
      >(`/api/lms/quiz-questions?moduleId=${moduleId}`),
  });
}

export function useSaveQuizQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      moduleId: string;
      question: string;
      options: string[];
      correctIndex: number;
      explanation?: string | null;
      sortOrder?: number;
    }) => {
      if (input.id) {
        return mutateApi(`/api/lms/quiz-questions/${input.id}`, {
          method: "PATCH",
          body: input,
        });
      }
      return mutateApi("/api/lms/quiz-questions", { method: "POST", body: input });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["quiz-questions", vars.moduleId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteQuizQuestion(moduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      mutateApi(`/api/lms/quiz-questions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiz-questions", moduleId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

/** Mark a document/video module complete from the player. */
export function useCompleteModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      enrollmentId: string;
      moduleId: string;
      timeSpent?: number;
    }) =>
      mutateApi("/api/lms/module-progress", {
        method: "POST",
        body: { ...input, completed: true },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-enrollments"] });
      qc.invalidateQueries({ queryKey: ["induction-readiness"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
