"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTodoSchema, type CreateTodoInput } from "@/lib/schemas/todo";
import { useCreateTodo } from "@/hooks/useTodos";
import { useQuery } from "@tanstack/react-query";
import { Lock, Unlock } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/form/FormField";
import { FormInput } from "@/components/ui/form/FormInput";
import { FormSelect } from "@/components/ui/form/FormSelect";
import { FormTextarea } from "@/components/ui/form/FormTextarea";

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

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
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
          <DialogTitle className="text-lg font-semibold text-gray-900">
            Create New To-Do
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-0.5">
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
          <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              {isPrivate ? (
                <Lock className="w-4 h-4 text-amber-600" />
              ) : (
                <Unlock className="w-4 h-4 text-gray-400" />
              )}
              <span className="text-sm text-gray-700">
                {isPrivate ? "Private" : "Public"} To-Do
              </span>
            </div>
            <button
              type="button"
              onClick={() => setValue("isPrivate", !isPrivate)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                isPrivate ? "bg-amber-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                  isPrivate ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTodo.isPending}
              className="flex-1 px-4 py-2 bg-[#004E64] text-white font-medium rounded-lg hover:bg-[#003D52] transition-colors disabled:opacity-50"
            >
              {createTodo.isPending ? "Creating..." : "Create To-Do"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
