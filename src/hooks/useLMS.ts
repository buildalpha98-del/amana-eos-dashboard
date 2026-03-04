"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
      const res = await fetch(`/api/lms/courses?${params}`);
      if (!res.ok) throw new Error("Failed to fetch courses");
      return res.json();
    },
  });
}

export function useLMSCourse(id: string | null) {
  return useQuery<LMSCourseData & { modules: LMSModuleData[]; enrollments: LMSEnrollmentData[] }>({
    queryKey: ["lms-course", id],
    queryFn: async () => {
      const res = await fetch(`/api/lms/courses/${id}`);
      if (!res.ok) throw new Error("Failed to fetch course");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateLMSCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch("/api/lms/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create course");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lms-courses"] });
    },
  });
}

export function useUpdateLMSCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/lms/courses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update course");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lms-courses"] });
      qc.invalidateQueries({ queryKey: ["lms-course"] });
    },
  });
}
