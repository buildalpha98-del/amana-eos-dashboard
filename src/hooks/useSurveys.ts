"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type {
  EmploymentType,
  Role,
  SurveyAudience,
  SurveyQuestionType,
  SurveyStatus,
} from "@prisma/client";

export interface SurveyQuestionData {
  id: string;
  type: SurveyQuestionType;
  title: string;
  description: string | null;
  required: boolean;
  options: string[];
  sortOrder: number;
}

export interface SurveyListItem {
  id: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  anonymous: boolean;
  audience: SurveyAudience;
  audienceRoles: Role[];
  audienceServiceIds: string[];
  audienceEmploymentTypes: EmploymentType[];
  closesAt: string | null;
  publishedAt: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  _count?: { questions: number; responses: number };
  _iHaveResponded?: boolean;
  questions?: SurveyQuestionData[];
}

export interface SurveyDetail extends SurveyListItem {
  questions: SurveyQuestionData[];
  _count?: { questions: number; responses: number };
}

/** List — admin view (all surveys) */
export function useSurveys() {
  return useQuery<{ surveys: SurveyListItem[] }>({
    queryKey: ["surveys"],
    queryFn: () => fetchApi("/api/surveys"),
    staleTime: 30_000,
  });
}

/** List — staff view (only surveys I belong to) */
export function useMySurveys() {
  return useQuery<{ surveys: SurveyListItem[] }>({
    queryKey: ["my-surveys"],
    queryFn: () => fetchApi("/api/surveys?mine=1"),
    staleTime: 60_000,
  });
}

/** Full survey with questions */
export function useSurvey(id: string | null) {
  return useQuery<SurveyDetail>({
    queryKey: ["survey", id],
    queryFn: () => fetchApi(`/api/surveys/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export interface QuestionInput {
  type: SurveyQuestionType;
  title: string;
  description?: string | null;
  required?: boolean;
  options?: string[];
  sortOrder?: number;
}

export interface CreateSurveyInput {
  title: string;
  description?: string | null;
  anonymous?: boolean;
  audience?: SurveyAudience;
  audienceRoles?: Role[];
  audienceServiceIds?: string[];
  audienceEmploymentTypes?: EmploymentType[];
  closesAt?: string | null;
  questions?: QuestionInput[];
}

export function useCreateSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSurveyInput) =>
      mutateApi<SurveyDetail>("/api/surveys", { method: "POST", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["surveys"] });
      toast({ description: "Survey draft created." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });
}

export function useUpdateSurvey(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateSurveyInput>) =>
      mutateApi<SurveyDetail>(`/api/surveys/${id}`, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["surveys"] });
      qc.invalidateQueries({ queryKey: ["survey", id] });
      toast({ description: "Survey updated." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });
}

export function useDeleteSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/surveys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["surveys"] });
      toast({ description: "Survey deleted." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });
}

export function usePublishSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/surveys/${id}/publish`, { method: "POST" }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["surveys"] });
      qc.invalidateQueries({ queryKey: ["survey", id] });
      toast({ description: "Survey published — staff can now respond." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });
}

export function useCloseSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/surveys/${id}/close`, { method: "POST" }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["surveys"] });
      qc.invalidateQueries({ queryKey: ["survey", id] });
      toast({ description: "Survey closed — no more responses accepted." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });
}

export interface AnswerInput {
  questionId: string;
  yesNo?: boolean | null;
  choiceIndexes?: number[];
  textValue?: string | null;
  ratingValue?: number | null;
}

export function useSubmitSurvey(surveyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: AnswerInput[]) =>
      mutateApi(`/api/surveys/${surveyId}/responses`, {
        method: "POST",
        body: { answers },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-surveys"] });
      qc.invalidateQueries({ queryKey: ["survey", surveyId] });
      toast({ description: "Thanks — your response was recorded." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });
}

export function useSurveyResults(id: string | null) {
  return useQuery({
    queryKey: ["survey-results", id],
    queryFn: () => fetchApi(`/api/surveys/${id}/results`),
    enabled: !!id,
    staleTime: 15_000,
  });
}
