"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ImagePlus, Eye, EyeOff, Loader2 } from "lucide-react";
import { LMS_MARKDOWN_REHYPE_PLUGINS } from "@/lib/lms-sanitize-schema";
import { toVideoEmbedUrl } from "@/lib/course-player";
import { toast } from "@/hooks/useToast";

/**
 * Authoring toolbar for a module's markdown content: an "Insert image" button
 * that uploads to Blob (the only image host the player sanitizer allows) and
 * appends the markdown, plus a live preview that renders exactly what the
 * learner sees (same sanitized markdown pipeline as the player).
 */
export function MediaToolbar({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      const { fileUrl } = (await res.json()) as { fileUrl: string };
      const alt = file.name.replace(/\.[^.]+$/, "");
      const snippet = `\n\n![${alt}](${fileUrl})\n\n`;
      onChange((value || "") + snippet);
      toast({ description: "Image added." });
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          {uploading ? "Uploading…" : "Insert image"}
        </button>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface"
        >
          {preview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {preview ? "Hide preview" : "Preview"}
        </button>
        <span className="text-[10px] text-muted">Markdown supported</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {preview && (
        <div className="rounded-lg border border-border bg-surface/40 p-3">
          {value?.trim() ? (
            <div className="prose prose-sm max-w-none text-foreground prose-headings:text-brand prose-a:text-brand prose-strong:text-brand prose-img:rounded-lg prose-img:border prose-img:border-border">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                rehypePlugins={LMS_MARKDOWN_REHYPE_PLUGINS as any}
              >
                {value}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-xs italic text-muted">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Inline validation hint for a video module's URL — confirms it resolves to a
 * host the player will actually embed (YouTube / Loom / Vimeo).
 */
export function VideoUrlHint({ url }: { url: string }) {
  if (!url.trim()) return null;
  const embed = toVideoEmbedUrl(url);
  return embed ? (
    <p className="text-[10px] text-emerald-600">✓ Will embed as a video player.</p>
  ) : (
    <p className="text-[10px] text-amber-600">
      ⚠ Only YouTube, Loom or Vimeo links embed as a player; other links open as a button.
    </p>
  );
}
