import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface CoordinatorTodoRow {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed" | "blocked";
  dueDate: string;
  completedAt: string | null;
  createdAt: string;
  assignee: { id: string; name: string } | null;
  service: { id: string; name: string; code: string } | null;
}

export interface CoordinatorTodosResponse {
  todos: CoordinatorTodoRow[];
}

export interface CoordinatorTodosQuery {
  serviceId?: string;
  status?: "pending" | "in_progress" | "completed" | "blocked";
}

const KEY = "marketing-coordinator-todos";

function destructive(err: Error) {
  toast({ variant: "destructive", description: err.message || "Something went wrong" });
}

function buildQuery(q: CoordinatorTodosQuery = {}): string {
  const parts: string[] = [];
  if (q.serviceId) parts.push(`serviceId=${q.serviceId}`);
  if (q.status) parts.push(`status=${q.status}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export function useCoordinatorTodos(query: CoordinatorTodosQuery = {}) {
  return useQuery<CoordinatorTodosResponse>({
    queryKey: [KEY, query.serviceId ?? "*", query.status ?? "*"],
    queryFn: () => fetchApi<CoordinatorTodosResponse>(`/api/marketing/coordinator-todos${buildQuery(query)}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export interface CreateCoordinatorTodoInput {
  title: string;
  description?: string;
  serviceIds: string[];
  dueDate: string;
  fallbackAssigneeId?: string;
  activationId?: string;
  campaignId?: string;
}

export interface CreateResult {
  created: Array<{ todoId: string; serviceId: string; serviceName: string; assigneeId: string; assigneeName: string }>;
  skipped: Array<{ serviceId: string; serviceName: string | null; reason: string }>;
}

export function useCreateCoordinatorTodo() {
  const qc = useQueryClient();
  return useMutation<CreateResult, Error, CreateCoordinatorTodoInput>({
    mutationFn: (input) =>
      mutateApi<CreateResult>("/api/marketing/coordinator-todos", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: destructive,
  });
}
