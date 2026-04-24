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

const MAX_IMAGES = 6;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

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
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
      setMediaUrls(editingPost.mediaUrls ?? []);
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
      setMediaUrls([]);
    }
    setUploadError(null);
  }, [editingPost, reset]);

  const isCommunity = watch("isCommunity");
  const children = childrenData?.children ?? [];

  function toggleChild(childId: string) {
    setSelectedChildIds((prev) =>
      prev.includes(childId) ? prev.filter((id) => id !== childId) : [...prev, childId],
    );
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);

    const room = MAX_IMAGES - mediaUrls.length - uploading;
    if (room <= 0) {
      setUploadError(`Maximum ${MAX_IMAGES} photos per post.`);
      return;
    }

    const picked = Array.from(files).slice(0, room);
    if (picked.length < files.length) {
      setUploadError(`Maximum ${MAX_IMAGES} photos per post.`);
    }

    for (const file of picked) {
      if (!file.type.startsWith("image/")) {
        setUploadError(`${file.name} is not an image.`);
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setUploadError(`${file.name} is too large (max 5 MB).`);
        continue;
      }

      setUploading((n) => n + 1);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload/image", { method: "POST", body: fd });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || "Upload failed");
        }
        const { url } = (await res.json()) as { url: string };
        setMediaUrls((prev) => [...prev, url]);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function removeImage(index: number) {
    setMediaUrls((prev) => prev.filter((_, i) => i !== index));
  }

  function onSubmit(data: CreateParentPostInput) {
    const payload = {
      ...data,
      mediaUrls,
      childIds: data.isCommunity ? [] : selectedChildIds,
    };

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
    setMediaUrls([]);
    setUploadError(null);
    onClose();
  }

  const remainingTiles = MAX_IMAGES - mediaUrls.length - uploading;

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

          <FormField label="Photos">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {mediaUrls.map((url, i) => (
                <div
                  key={`${url}-${i}`}
                  className="relative aspect-square rounded-lg overflow-hidden border border-border bg-surface"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Uploaded photo"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-black/80"
                  >
                    ×
                  </button>
                </div>
              ))}
              {Array.from({ length: uploading }).map((_, i) => (
                <div
                  key={`uploading-${i}`}
                  className="aspect-square rounded-lg border border-border bg-surface flex items-center justify-center text-xs text-muted"
                >
                  Uploading…
                </div>
              ))}
              {remainingTiles > 0 && (
                <label className="aspect-square rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-surface">
                  <span className="sr-only">Add photos</span>
                  <span aria-hidden className="text-2xl text-muted">
                    +
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleFiles(e.target.files);
                      e.target.value = "";
                    }}
                    aria-label="Add photos"
                  />
                </label>
              )}
            </div>
            {uploadError && (
              <p className="mt-1 text-xs text-red-600">{uploadError}</p>
            )}
            <p className="mt-1 text-xs text-muted">
              Up to {MAX_IMAGES} photos, 5 MB each.
            </p>
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
            <Button type="submit" loading={mutation.isPending} disabled={uploading > 0}>
              {isEditing ? "Save Changes" : "Create Post"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
