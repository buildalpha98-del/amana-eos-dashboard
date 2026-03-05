"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createRockSchema, type CreateRockInput } from "@/lib/schemas/rock";
import { useCreateRock } from "@/hooks/useRocks";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { FormField } from "@/components/ui/form/FormField";
import { FormInput } from "@/components/ui/form/FormInput";
import { FormSelect } from "@/components/ui/form/FormSelect";
import { FormTextarea } from "@/components/ui/form/FormTextarea";
import type { RockPriority, RockType } from "@prisma/client";

interface UserOption {
  id: string;
  name: string;
  email: string;
}

export function CreateRockModal({
  open,
  onClose,
  quarter,
}: {
  open: boolean;
  onClose: () => void;
  quarter: string;
}) {
  const createRock = useCreateRock();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateRockInput>({
    resolver: zodResolver(createRockSchema),
    defaultValues: {
      title: "",
      description: "",
      ownerId: "",
      quarter,
      priority: "medium",
      rockType: "personal",
    },
  });

  const rockType = watch("rockType");

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (!open) return null;

  const onSubmit = (data: CreateRockInput) => {
    createRock.mutate(
      {
        ...data,
        description: data.description || undefined,
        quarter,
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Create New Rock
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">{quarter.replace("-", " ")}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Title" error={errors.title}>
            <FormInput
              registration={register("title")}
              hasError={!!errors.title}
              placeholder="e.g., Launch 3 new NSW centres by end of quarter"
            />
          </FormField>

          <FormField label="Description" optional>
            <FormTextarea
              registration={register("description")}
              rows={3}
              placeholder="Describe the Rock in detail..."
            />
          </FormField>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Rock Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setValue("rockType", "company")}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  rockType === "company"
                    ? "bg-[#004E64] text-white border-[#004E64]"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Company Rock
              </button>
              <button
                type="button"
                onClick={() => setValue("rockType", "personal")}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  rockType === "personal"
                    ? "bg-[#004E64] text-white border-[#004E64]"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Personal Rock
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Owner" error={errors.ownerId}>
              <FormSelect
                registration={register("ownerId")}
                hasError={!!errors.ownerId}
              >
                <option value="">Select owner...</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </FormSelect>
            </FormField>

            <FormField label="Priority">
              <FormSelect registration={register("priority")}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
              </FormSelect>
            </FormField>
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
              disabled={createRock.isPending}
              className="flex-1 px-4 py-2 bg-[#004E64] text-white font-medium rounded-lg hover:bg-[#003D52] transition-colors disabled:opacity-50"
            >
              {createRock.isPending ? "Creating..." : "Create Rock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
