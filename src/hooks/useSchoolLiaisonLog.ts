import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface SchoolLiaisonLog {
  id: string;
  serviceId: string;
  service: { id: string; name: string };
  contactName: string;
  channel: string;
  summary: string;
  loggedAt: string;
  createdAt: string;
}

export type LiaisonChannel = "phone" | "email" | "in_person" | "whatsapp" | "other";

const KEY = "school-liaison-log";

export function useSchoolLiaisonLogs(serviceId?: string) {
  const url = serviceId
    ? `/api/marketing/school-liaison-log?serviceId=${serviceId}`
    : "/api/marketing/school-liaison-log";
  return useQuery<SchoolLiaisonLog[]>({
    queryKey: [KEY, serviceId ?? "all"],
    queryFn: () => fetchApi<SchoolLiaisonLog[]>(url),
    retry: 2,
    staleTime: 30_000,
  });
}

export interface CreateLogInput {
  serviceId: string;
  contactName: string;
  channel: LiaisonChannel;
  summary: string;
  loggedAt?: string;
}

export function useCreateLiaisonLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLogInput) =>
      mutateApi("/api/marketing/school-liaison-log", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message || "Something went wrong" }),
  });
}

export function useDeleteLiaisonLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/marketing/school-liaison-log/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message || "Something went wrong" }),
  });
}
