"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createParentPostSchema, type CreateParentPostInput } from "@/lib/schemas/parent-post";
import { useCreateParentPost, useUpdateParentPost, type ParentPost } from "@/hooks/useParentPosts";
import { MTOP_OUTCOMES, NQS_AREAS, nqsLabel } from "@/lib/curriculum";
import { useChildren } from "@/hooks/useChildren";
import { downscaleImage } from "@/lib/downscale-image";
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
  const [mtop, setMtop] = useState<string[]>([]);
  const [nqs, setNqs] = useState<string[]>([]);
  // Scheduling. Empty = publish now; a local datetime string otherwise.
  const [publishAt, setPublishAt] = useState<string>("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const isEditing = !!editingPost;
  const mutation = isEditing ? updatePost : createPost;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateParentPostInput>({
    resolver: zodResolver(createParentPostSchema),
    defaultValues: {
      title: "",
      content: "",
      type: "observation",
      mediaUrls: [],
      // Every published post is centre-wide.
      isCommunity: true,
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
        isCommunity: true,
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
        // Every published post is centre-wide.
      isCommunity: true,
        childIds: [],
      });
      setSelectedChildIds([]);
      setMediaUrls([]);
    }
    setUploadError(null);
  }, [editingPost, reset]);

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
        // Shrink before it leaves the phone. A post with four camera
        // originals is a 20 MB upload over school wifi and a 20 MB
        // download for every family who scrolls past it.
        const toSend = await downscaleImage(file);
        const fd = new FormData();
        fd.append("file", toSend);
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
      // Always sent: tagging no longer suppresses the tag list.
      childIds: selectedChildIds,
      mtopOutcomes: mtop,
      nqsAreas: nqs,
      // datetime-local has no timezone, so it's read as LOCAL time and
      // converted to an instant here. Sending the raw string would be
      // interpreted as UTC and shift the post by the offset.
      ...(publishAt
        ? {
            status: "scheduled" as const,
            publishAt: new Date(publishAt).toISOString(),
          }
        : { status: "published" as const }),
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
                <option value="programme">Programme</option>
                <option value="food">Food</option>
                <option value="celebration">Celebration</option>
                <option value="announcement">Announcement</option>
                <option value="reminder">Reminder</option>
              </FormSelect>
            </FormField>

            {/*
              The "Community post — visible to all parents" tick is gone.
              Every published post now reaches every family at the centre,
              so the box could only ever mislead: leaving it unticked used
              to make a post private to the tagged families, which is not
              what anyone reading "community post" would expect.
            */}
          </div>

          <FormField label="Tag children (optional)">
              {children.length > 0 && (
                <label className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      selectedChildIds.length === children.length &&
                      children.length > 0
                    }
                    onChange={(e) =>
                      setSelectedChildIds(
                        e.target.checked ? children.map((c) => c.id) : [],
                      )
                    }
                    className="w-4 h-4 rounded border-border text-brand focus:ring-brand"
                  />
                  <span className="text-sm font-medium">
                    Select all children ({children.length})
                  </span>
                </label>
              )}
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
            <p className="mt-1 text-xs text-muted">
              Everyone at this centre sees this post. Tagging decides whose
              child page it also appears on — and only that family is ever
              shown their child&apos;s name.
            </p>
          </FormField>

          {/* Curriculum tagging — MTOP is the school-age framework, so
              EYLF is deliberately not offered here. */}
          <FormField label="My Time, Our Place (MTOP) outcomes">
            <div className="flex flex-wrap gap-2">
              {MTOP_OUTCOMES.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  title={o.description}
                  onClick={() =>
                    setMtop((prev) =>
                      prev.includes(o.label)
                        ? prev.filter((x) => x !== o.label)
                        : [...prev, o.label],
                    )
                  }
                  aria-pressed={mtop.includes(o.label)}
                  className={
                    "px-3 min-h-11 rounded-lg border text-sm font-medium transition-colors " +
                    (mtop.includes(o.label)
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border bg-card text-muted hover:border-brand/40")
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="NQS quality areas">
            <div className="flex flex-wrap gap-2">
              {NQS_AREAS.map((a) => (
                <button
                  key={a.code}
                  type="button"
                  title={a.label}
                  onClick={() =>
                    setNqs((prev) =>
                      prev.includes(a.code)
                        ? prev.filter((x) => x !== a.code)
                        : [...prev, a.code],
                    )
                  }
                  aria-pressed={nqs.includes(a.code)}
                  aria-label={nqsLabel(a.code)}
                  className={
                    "px-3 min-h-11 rounded-lg border text-sm font-medium transition-colors " +
                    (nqs.includes(a.code)
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border bg-card text-muted hover:border-brand/40")
                  }
                >
                  {a.code}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="Schedule">
            <input
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <p className="mt-1 text-xs text-muted">
              Leave blank to publish immediately. A time in the past
              publishes straight away rather than sitting pending.
            </p>
          </FormField>

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
