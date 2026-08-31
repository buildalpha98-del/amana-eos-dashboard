"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTodoSchema, type CreateTodoInput } from "@/lib/schemas/todo";
import { useCreateTodo } from "@/hooks/useTodos";
import { useQuery } from "@tanstack/react-query";
import { Lock, Unlock, Sparkles, Check, X as XIcon } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/form/FormField";
import { FormInput } from "@/components/ui/form/FormInput";
import { FormSelect } from "@/components/ui/form/FormSelect";
import { FormTextarea } from "@/components/ui/form/FormTextarea";
import { AiButton } from "@/components/ui/AiButton";
import {
  parseAiDraft,
  type AiDraftSuggestion,
} from "@/lib/todos/parse-ai-draft";

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface RockOption {
  id: string;
  title: string;
}

export function CreateTodoModal({
  open,
  onClose,
  weekOf,
}: {
  open: boolean;
  onClose: () => void;
  weekOf: Date;
}) {
  const createTodo = useCreateTodo();

  const defaultDueDate = (() => {
    const end = new Date(weekOf);
    end.setDate(end.getDate() + 6);
    return end.toISOString().split("T")[0];
  })();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateTodoInput>({
    resolver: zodResolver(createTodoSchema),
    defaultValues: {
      title: "",
      description: "",
      assigneeId: "",
      rockId: "",
      isPrivate: false,
      dueDate: defaultDueDate,
      weekOf: weekOf.toISOString(),
    },
  });

  const isPrivate = watch("isPrivate");
  const description = watch("description") ?? "";

  // AI Draft state — the suggestion the user can apply or discard.
  // Lives inside the modal (no redirect to Admin) per the Bucket M spec.
  const [aiDraft, setAiDraft] = useState<AiDraftSuggestion | null>(null);

  function handleAiResult(raw: string) {
    const parsed = parseAiDraft(raw);
    if (!parsed) {
      toast({
        variant: "destructive",
        description: "AI returned an unexpected format. Try again.",
      });
      return;
    }
    setAiDraft(parsed);
  }

  function applyAiDraft() {
    if (!aiDraft) return;
    setValue("title", aiDraft.title, { shouldValidate: true });
    setValue("description", aiDraft.description, { shouldValidate: true });
    setAiDraft(null);
  }

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users?scope=eos_assignees");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: rocks } = useQuery<RockOption[]>({
    queryKey: ["rocks-list-active"],
    queryFn: async () => {
      const res = await fetch("/api/rocks");
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((r: RockOption) => ({ id: r.id, title: r.title }));
    },
  });

  const onSubmit = (data: CreateTodoInput) => {
    createTodo.mutate(
      {
        ...data,
        description: data.description || undefined,
        rockId: data.rockId || null,
        weekOf: weekOf.toISOString(),
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent size="lg">
        <div className="mb-6">
          <DialogTitle className="text-lg font-semibold text-foreground">
            Create New To-Do
          </DialogTitle>
          <p className="text-sm text-muted mt-0.5">
            Week of{" "}
            {weekOf.toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Title" error={errors.title}>
            <FormInput
              registration={register("title")}
              hasError={!!errors.title}
              placeholder="e.g., Follow up with NSW property managers"
            />
          </FormField>

          <FormField label="Description" optional>
            <FormTextarea
              registration={register("description")}
              rows={2}
              placeholder="Add details..."
            />
            {/* AI Draft trigger — only active once the user has typed a
                description. Clicking generates a polished title +
                description, shown in the panel below before applying. */}
            <div className="mt-2 flex justify-end">
              <AiButton
                templateSlug="todos/draft-from-description"
                variables={{ description }}
                onResult={handleAiResult}
                disabled={description.trim().length === 0}
                label="Create AI Draft"
                size="sm"
                section="todo-create"
              />
            </div>
            {aiDraft ? (
              <div
                className="mt-3 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 p-3 space-y-2"
                data-testid="todo-ai-draft-panel"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI Draft suggestion
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-purple-700/80">
                    Title
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {aiDraft.title}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-purple-700/80">
                    Description
                  </p>
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                    {aiDraft.description}
                  </p>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={applyAiDraft}
                    className="inline-flex items-center gap-1 rounded-md bg-purple-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-purple-700"
                    data-testid="todo-ai-draft-apply"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Use this
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiDraft(null)}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground/80 hover:bg-surface"
                    data-testid="todo-ai-draft-discard"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                    Discard
                  </button>
                </div>
              </div>
            ) : null}
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Assignee" error={errors.assigneeId}>
              <FormSelect
                registration={register("assigneeId")}
                hasError={!!errors.assigneeId}
              >
                <option value="">Select person...</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </FormSelect>
            </FormField>

            <FormField label="Due Date" error={errors.dueDate}>
              <FormInput
                registration={register("dueDate")}
                hasError={!!errors.dueDate}
                type="date"
              />
            </FormField>
          </div>

          <FormField label="Linked Rock" optional>
            <FormSelect registration={register("rockId")}>
              <option value="">No linked Rock</option>
              {rocks?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </FormSelect>
          </FormField>

          {/* Private Toggle */}
          <div className="flex items-center justify-between py-2 px-3 bg-surface/50 rounded-lg">
            <div className="flex items-center gap-2">
              {isPrivate ? (
                <Lock className="w-4 h-4 text-amber-600" />
              ) : (
                <Unlock className="w-4 h-4 text-muted" />
              )}
              <span className="text-sm text-foreground/80">
                {isPrivate ? "Private" : "Public"} To-Do
              </span>
            </div>
            <button
              type="button"
              onClick={() => setValue("isPrivate", !isPrivate)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                isPrivate ? "bg-amber-500" : "bg-border"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-card shadow-sm transition-transform ${
                  isPrivate ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border text-foreground/80 font-medium rounded-lg hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTodo.isPending}
              className="flex-1 px-4 py-2 bg-brand text-white font-medium rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {createTodo.isPending ? "Creating..." : "Create To-Do"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
