"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createIssueSchema, type CreateIssueInput } from "@/lib/schemas/issue";
import { useCreateIssue } from "@/hooks/useIssues";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/form/FormField";
import { FormInput } from "@/components/ui/form/FormInput";
import { FormSelect } from "@/components/ui/form/FormSelect";
import { FormTextarea } from "@/components/ui/form/FormTextarea";

interface UserOption {
  id: string;
  name: string;
}

interface RockOption {
  id: string;
  title: string;
}

export function CreateIssueModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createIssue = useCreateIssue();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateIssueInput>({
    resolver: zodResolver(createIssueSchema),
    defaultValues: {
      title: "",
      description: "",
      ownerId: "",
      rockId: "",
      priority: "medium",
    },
  });

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

  const onSubmit = (data: CreateIssueInput) => {
    createIssue.mutate(
      {
        ...data,
        description: data.description || undefined,
        ownerId: data.ownerId || null,
        rockId: data.rockId || null,
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
            Raise an Issue
          </DialogTitle>
          <p className="text-sm text-muted mt-0.5">
            Identify an issue for the IDS process
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Issue Title" error={errors.title}>
            <FormInput
              registration={register("title")}
              hasError={!!errors.title}
              placeholder="e.g., Staff retention at Western Sydney centres"
            />
          </FormField>

          <FormField label="Description" optional>
            <FormTextarea
              registration={register("description")}
              rows={3}
              placeholder="Context and impact..."
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Priority">
              <FormSelect registration={register("priority")}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </FormSelect>
            </FormField>

            <FormField label="Owner" optional>
              <FormSelect registration={register("ownerId")}>
                <option value="">Unassigned</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </FormSelect>
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
              disabled={createIssue.isPending}
              className="flex-1 px-4 py-2 bg-brand text-white font-medium rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {createIssue.isPending ? "Creating..." : "Raise Issue"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
