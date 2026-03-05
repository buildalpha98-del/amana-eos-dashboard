import { z } from "zod";

export const createTodoSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  assigneeId: z.string().min(1, "Assignee is required"),
  rockId: z.string().optional().nullable(),
  issueId: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  isPrivate: z.boolean().optional(),
  dueDate: z.string().min(1, "Due date is required"),
  weekOf: z.string().min(1, "Week is required"),
});

export type CreateTodoInput = z.infer<typeof createTodoSchema>;
