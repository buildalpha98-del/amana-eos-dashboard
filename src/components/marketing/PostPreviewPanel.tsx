"use client";

import { X, Facebook, Instagram, Linkedin, Globe, Mail, FileText } from "lucide-react";

interface PostPreviewPanelProps {
  title: string;
  content: string;
  platform: string;
  scheduledDate: string | null;
  canvaExportUrl?: string | null;
  designLink?: string | null;
  assigneeName?: string;
  onClose: () => void;
}

const PLATFORM_META: Record<
  string,
  { icon: typeof Facebook; name: string; accent: string; bg: string }
> = {
  facebook: { icon: Facebook, name: "Facebook", accent: "text-blue-600", bg: "bg-blue-50" },
  instagram: { icon: Instagram, name: "Instagram", accent: "text-pink-600", bg: "bg-pink-50" },
  linkedin: { icon: Linkedin, name: "LinkedIn", accent: "text-sky-700", bg: "bg-sky-50" },
  email: { icon: Mail, name: "Email", accent: "text-amber-600", bg: "bg-amber-50" },
  newsletter: { icon: Mail, name: "Newsletter", accent: "text-teal-600", bg: "bg-teal-50" },
  website: { icon: Globe, name: "Website", accent: "text-emerald-600", bg: "bg-emerald-50" },
  flyer: { icon: FileText, name: "Flyer", accent: "text-orange-600", bg: "bg-orange-50" },
};

export function PostPreviewPanel({
  title,
  content,
  platform,
  scheduledDate,
  canvaExportUrl,
  designLink,
  assigneeName,
  onClose,
}: PostPreviewPanelProps) {
  const meta = PLATFORM_META[platform] || PLATFORM_META.website;
  const PlatformIcon = meta.icon;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-card shadow-2xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${meta.bg}`}>
              <PlatformIcon className={`h-4 w-4 ${meta.accent}`} />
            </div>
            <span className="text-sm font-semibold text-foreground">
              {meta.name} Preview
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Preview Body */}
        <div className="p-5">
          {platform === "facebook" && (
            <FacebookPreview
              title={title}
              content={content}
              imageUrl={canvaExportUrl}
              assigneeName={assigneeName}
              scheduledDate={scheduledDate}
            />
          )}
          {platform === "instagram" && (
            <InstagramPreview
              content={content}
              imageUrl={canvaExportUrl}
              assigneeName={assigneeName}
            />
          )}
          {platform === "linkedin" && (
            <LinkedInPreview
              title={title}
              content={content}
              assigneeName={assigneeName}
            />
          )}
          {!["facebook", "instagram", "linkedin"].includes(platform) && (
            <GenericPreview
              title={title}
              content={content}
              platform={meta.name}
              imageUrl={canvaExportUrl}
            />
          )}
        </div>

        {/* Footer meta */}
        <div className="border-t border-border/50 px-5 py-3 text-xs text-muted flex items-center justify-between">
          <span>Preview is approximate — actual rendering varies by platform</span>
          {scheduledDate && (
            <span>
              {new Date(scheduledDate).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Facebook ─── */
function FacebookPreview({
  title,
  content,
  imageUrl,
  assigneeName,
  scheduledDate,
}: {
  title: string;
  content: string;
  imageUrl?: string | null;
  assigneeName?: string;
  scheduledDate?: string | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* FB header */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className="h-10 w-10 rounded-full bg-brand flex items-center justify-center text-white text-sm font-bold">
          A
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Amana OSHC</p>
          <p className="text-xs text-muted">
            {scheduledDate
              ? new Date(scheduledDate).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                })
              : "Just now"}{" "}
            · 🌐
          </p>
        </div>
      </div>
      {/* Content */}
      <div className="px-4 pb-3">
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
          {content || <span className="text-muted italic">No content yet</span>}
        </p>
      </div>
      {/* Image */}
      {imageUrl ? (
        <img src={imageUrl} alt={title} className="w-full object-cover max-h-72" />
      ) : (
        <div className="w-full h-48 bg-surface flex items-center justify-center">
          <span className="text-xs text-muted">Image will appear here</span>
        </div>
      )}
      {/* Engagement bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border/50 text-xs text-muted">
        <span>👍 Like</span>
        <span>💬 Comment</span>
        <span>↗ Share</span>
      </div>
    </div>
  );
}

/* ─── Instagram ─── */
function InstagramPreview({
  content,
  imageUrl,
  assigneeName,
}: {
  content: string;
  imageUrl?: string | null;
  assigneeName?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* IG header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-0.5">
          <div className="h-full w-full rounded-full bg-card flex items-center justify-center text-[10px] font-bold text-foreground/80">
            A
          </div>
        </div>
        <span className="text-xs font-semibold text-foreground">amana_oshc</span>
      </div>
      {/* Image (square) */}
      {imageUrl ? (
        <img src={imageUrl} alt="Post" className="w-full aspect-square object-cover" />
      ) : (
        <div className="w-full aspect-square bg-surface flex items-center justify-center">
          <span className="text-xs text-muted">Image will appear here</span>
        </div>
      )}
      {/* Actions */}
      <div className="flex items-center gap-4 px-3 py-2.5 text-foreground">
        <span className="text-lg">♡</span>
        <span className="text-lg">💬</span>
        <span className="text-lg">↗</span>
      </div>
      {/* Caption */}
      <div className="px-3 pb-3">
        <p className="text-xs text-foreground leading-relaxed">
          <span className="font-semibold mr-1">amana_oshc</span>
          {content || <span className="text-muted italic">No caption yet</span>}
        </p>
      </div>
    </div>
  );
}

/* ─── LinkedIn ─── */
function LinkedInPreview({
  title,
  content,
  assigneeName,
}: {
  title: string;
  content: string;
  assigneeName?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* LI header */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className="h-12 w-12 rounded-lg bg-brand flex items-center justify-center text-white text-sm font-bold">
          A
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Amana OSHC</p>
          <p className="text-[10px] text-muted">
            1,200 followers · Just now
          </p>
        </div>
      </div>
      {/* Content */}
      <div className="px-4 pb-3">
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
          {content || <span className="text-muted italic">No content yet</span>}
        </p>
      </div>
      {/* Engagement */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border/50 text-xs text-muted">
        <span>👍 Like</span>
        <span>💬 Comment</span>
        <span>🔄 Repost</span>
        <span>↗ Send</span>
      </div>
    </div>
  );
}

/* ─── Generic (Email, Newsletter, Website, Flyer) ─── */
function GenericPreview({
  title,
  content,
  platform,
  imageUrl,
}: {
  title: string;
  content: string;
  platform: string;
  imageUrl?: string | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 bg-surface/50 border-b border-border">
        <p className="text-xs text-muted uppercase tracking-wider">{platform}</p>
        <p className="text-sm font-semibold text-foreground mt-0.5">
          {title || <span className="text-muted italic">Untitled</span>}
        </p>
      </div>
      {imageUrl && (
        <img src={imageUrl} alt={title} className="w-full object-cover max-h-56" />
      )}
      <div className="px-4 py-3">
        <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
          {content || <span className="text-muted italic">No content yet</span>}
        </p>
      </div>
    </div>
  );
}
