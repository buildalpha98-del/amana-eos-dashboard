"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, ExternalLink } from "lucide-react";
import { LMS_MARKDOWN_REHYPE_PLUGINS } from "@/lib/lms-sanitize-schema";
import { toVideoEmbedUrl } from "@/lib/course-player";

export interface PlayerModule {
  id: string;
  title: string;
  description: string | null;
  type: "document" | "video" | "quiz" | "checklist" | "external_link";
  content: string | null;
  resourceUrl: string | null;
  documentId: string | null;
  duration: number | null;
}

/**
 * Renders a single module's rich content: markdown (with sanitized inline
 * images/videos), an optional primary embedded video, and an optional linked
 * document. Quiz modules render their body here too; the QuizPlayer handles the
 * interactive quiz separately.
 */
export function ModuleContent({ module }: { module: PlayerModule }) {
  const embedUrl = module.type === "video" ? toVideoEmbedUrl(module.resourceUrl) : null;

  return (
    <div className="space-y-6">
      {module.description && (
        <p className="text-sm text-muted italic">{module.description}</p>
      )}

      {embedUrl && (
        <div className="relative w-full overflow-hidden rounded-xl border border-border" style={{ paddingTop: "56.25%" }}>
          <iframe
            src={embedUrl}
            title={module.title}
            className="absolute inset-0 h-full w-full"
            allow="accelerated-download; autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {module.content && (
        <div className="prose prose-sm max-w-none text-foreground leading-relaxed prose-headings:text-brand prose-a:text-brand prose-strong:text-brand prose-img:rounded-lg prose-img:border prose-img:border-border">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rehypePlugins={LMS_MARKDOWN_REHYPE_PLUGINS as any}
          >
            {module.content}
          </ReactMarkdown>
        </div>
      )}

      {module.type === "external_link" && module.resourceUrl && (
        <a
          href={module.resourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover"
        >
          <ExternalLink className="h-4 w-4" />
          Open resource
        </a>
      )}

      {module.documentId && (
        <a
          href={`/api/documents/${module.documentId}/download`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface/70"
        >
          <FileText className="h-4 w-4" />
          Open the attached document
        </a>
      )}
    </div>
  );
}
