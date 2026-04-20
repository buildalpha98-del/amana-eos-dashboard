"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface LMSModuleData {
  id: string;
  title: string;
  description: string | null;
  type: "document" | "video" | "quiz" | "checklist" | "external_link";
  content: string | null;
  resourceUrl: string | null;
  documentId: string | null;
  duration: number | null;
  sortOrder: number;
  isRequired: boolean;
}

export interface LMSCourseData {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  thumbnail: string | null;
  status: "draft" | "published" | "archived";
  isRequired: boolean;
  serviceId: string | null;
  service: { id: string; name: string; code: string } | null;
  sortOrder: number;
  _count: { modules: number; enrollments: number };
  modules?: LMSModuleData[];
}

export interface LMSModuleProgressData {
  id: string;
  moduleId: string;
  completed: boolean;
  completedAt: string | null;
  score: number | null;
  timeSpent: number | null;
  module: { id: string; title: string };
}

export interface LMSEnrollmentData {
  id: string;
  userId: string;
  courseId: string;
  status: "enrolled" | "in_progress" | "completed" | "expired";
  enrolledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  dueDate: string | null;
  score: number | null;
  user: { id: string; name: string; email: string; avatar: string | null };
  moduleProgress: LMSModuleProgressData[];
}

export function useLMSCourses(status?: string, serviceId?: string) {
  return useQuery<LMSCourseData[]>({
    queryKey: ["lms-courses", status, serviceId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (serviceId) params.set("serviceId", serviceId);
      return fetchApi<LMSCourseData[]>(`/api/lms/courses?${params}`);
    },
    retry: 2,
  });
}

export function useLMSCourse(id: string | null) {
  return useQuery<LMSCourseData & { modules: LMSModuleData[]; enrollments: LMSEnrollmentData[] }>({
    queryKey: ["lms-course", id],
    queryFn: async () => {
      return fetchApi(`/api/lms/courses/${id}`);
    },
    enabled: !!id,
    retry: 2,
  });
}

export function useCreateLMSCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return mutateApi("/api/lms/courses", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lms-courses"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateLMSCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      return mutateApi(`/api/lms/courses/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lms-courses"] });
      qc.invalidateQueries({ queryKey: ["lms-course"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useCreateModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId, ...data }: {
      courseId: string;
      title: string;
      description?: string;
      type?: string;
      content?: string;
      resourceUrl?: string;
      duration?: number;
      isRequired?: boolean;
    }) => {
      return mutateApi(`/api/lms/courses/${courseId}/modules`, {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lms-course"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ moduleId, ...data }: {
      moduleId: string;
      title?: string;
      description?: string | null;
      type?: string;
      content?: string | null;
      resourceUrl?: string | null;
      duration?: number | null;
      isRequired?: boolean;
    }) => {
      return mutateApi(`/api/lms/modules/${moduleId}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lms-course"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (moduleId: string) => {
      return mutateApi(`/api/lms/modules/${moduleId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lms-course"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useReorderModules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId, moduleIds }: { courseId: string; moduleIds: string[] }) => {
      return mutateApi(`/api/lms/courses/${courseId}/modules`, {
        method: "POST",
        body: { moduleIds },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lms-course"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useEnrollStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { courseId: string; userIds: string[]; dueDate?: string }) => {
      return mutateApi("/api/lms/enrollments", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lms-course"] });
      qc.invalidateQueries({ queryKey: ["lms-courses"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUnenrollStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enrollmentId: string) => {
      return mutateApi("/api/lms/enrollments", {
        method: "DELETE",
        body: { enrollmentId },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lms-course"] });
      qc.invalidateQueries({ queryKey: ["lms-courses"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useSelfEnrol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (courseId: string) => {
      return mutateApi("/api/lms/enrollments", {
        method: "POST",
        body: { selfEnrol: true, courseId },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lms-courses"] });
      qc.invalidateQueries({ queryKey: ["lms-course"] });
      qc.invalidateQueries({ queryKey: ["my-enrollments"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useMyEnrollments() {
  return useQuery<(LMSEnrollmentData & { course: LMSCourseData & { modules: LMSModuleData[] } })[]>({
    queryKey: ["my-enrollments"],
    queryFn: async () => {
      return fetchApi("/api/lms/my-enrollments");
    },
    retry: 2,
  });
}

export function useUpdateModuleProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { enrollmentId: string; moduleId: string; completed: boolean }) => {
      return mutateApi("/api/lms/enrollments", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lms-course"] });
      qc.invalidateQueries({ queryKey: ["my-enrollments"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
