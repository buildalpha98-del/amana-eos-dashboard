"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createParentPostSchema, type CreateParentPostInput } from "@/lib/schemas/parent-post";
import { useCreateParentPost, useUpdateParentPost, type ParentPost } from "@/hooks/useParentPosts";
import { useChildren } from "@/hooks/useChildren";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/form/FormField";
import { FormInput } from "@/components/ui/form/FormInput";
import { FormTextarea } from "@/components/ui/form/FormTextarea";
import { FormSelect } from "@/components/ui/form/FormSelect";
import { Button } from "@/components/ui/Button";

interface CreateParentPostFormProps {
  serviceId: string;
  open: boolean;
  onClose: () => void;
  editingPost?: ParentPost | null;
}

export function CreateParentPostForm({ serviceId, open, onClose, editingPost }: CreateParentPostFormProps) {
  const createPost = useCreateParentPost(serviceId);
  const updatePost = useUpdateParentPost(serviceId);
  const { data: childrenData } = useChildren({ serviceId, status: "active" });
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);

  const isEditing = !!editingPost;
  const mutation = isEditing ? updatePost : createPost;

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateParentPostInput>({
    resolver: zodResolver(createParentPostSchema),
    defaultValues: {
      title: "",
      content: "",
      type: "observation",
      mediaUrls: [],
      isCommunity: false,
      childIds: [],
    },
  });

  // When editingPost changes, populate the form
  useEffect(() => {
    if (editingPost) {
      reset({
        title: editingPost.title,
        content: editingPost.content,
        type: editingPost.type as "observation" | "announcement" | "reminder",
        mediaUrls: editingPost.mediaUrls,
        isCommunity: editingPost.isCommunity,
        childIds: [],
      });
      setSelectedChildIds(editingPost.tags.map((t) => t.childId));
    } else {
      reset({
        title: "",
        content: "",
        type: "observation",
        mediaUrls: [],
        isCommunity: false,
        childIds: [],
      });
      setSelectedChildIds([]);
    }
  }, [editingPost, reset]);

  const isCommunity = watch("isCommunity");
  const children = childrenData?.children ?? [];

  function toggleChild(childId: string) {
    setSelectedChildIds((prev) =>
      prev.includes(childId) ? prev.filter((id) => id !== childId) : [...prev, childId],
    );
  }

  function onSubmit(data: CreateParentPostInput) {
    const payload = { ...data, childIds: data.isCommunity ? [] : selectedChildIds };

    if (isEditing) {
      updatePost.mutate(
        { ...payload, postId: editingPost.id },
        {
          onSuccess: () => {
            handleClose();
          },
        },
      );
    } else {
      createPost.mutate(payload, {
        onSuccess: () => {
          handleClose();
        },
      });
    }
  }

  function handleClose() {
    reset();
    setSelectedChildIds([]);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent size="lg">
        <DialogTitle className="text-lg font-semibold">
          {isEditing ? "Edit Post" : "Create Post"}
        </DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
          <FormField label="Title" error={errors.title}>
            <FormInput
              registration={register("title")}
              hasError={!!errors.title}
              placeholder="e.g. Great day at the park!"
            />
          </FormField>

          <FormField label="Content" error={errors.content}>
            <FormTextarea
              registration={register("content")}
              hasError={!!errors.content}
              rows={4}
              placeholder="Write your observation, announcement, or reminder..."
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Type" error={errors.type}>
              <FormSelect registration={register("type")} hasError={!!errors.type}>
                <option value="observation">Observation</option>
                <option value="announcement">Announcement</option>
                <option value="reminder">Reminder</option>
              </FormSelect>
            </FormField>

            <FormField label="Community Post">
              <label className="flex items-center gap-2 mt-1 cursor-pointer">
                <input
                  type="checkbox"
                  {...register("isCommunity")}
                  className="w-4 h-4 rounded border-border text-brand focus:ring-brand"
                />
                <span className="text-sm text-muted">Visible to all parents</span>
              </label>
            </FormField>
          </div>

          {!isCommunity && (
            <FormField label="Tag Children">
              <div className="border border-border rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
                {children.length === 0 ? (
                  <p className="text-sm text-muted p-2">No enrolled children found</p>
                ) : (
                  children.map((child) => (
                    <label
                      key={child.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedChildIds.includes(child.id)}
                        onChange={() => toggleChild(child.id)}
                        className="w-4 h-4 rounded border-border text-brand focus:ring-brand"
                      />
                      <span className="text-sm">
                        {child.firstName} {child.surname}
                      </span>
                    </label>
                  ))
                )}
              </div>
              {!isCommunity && selectedChildIds.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  Select at least one child, or mark as community post
                </p>
              )}
            </FormField>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {isEditing ? "Save Changes" : "Create Post"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
