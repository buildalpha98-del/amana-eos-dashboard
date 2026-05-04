"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import {
  Bold, Italic, Strikethrough, List, ListOrdered, Quote,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Link2, Table as TableIcon, Eye,
} from "lucide-react";

import { useContractTemplate } from "@/hooks/useContractTemplates";
import { useTemplateAutosave } from "@/hooks/useTemplateAutosave";
import { toast } from "@/hooks/useToast";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import type { ManualField } from "@/lib/contract-templates/manual-fields-schema";
import { MergeTagNode } from "./MergeTagNode";
import { MergeTagPanel } from "./MergeTagPanel";
import { ManualFieldsPanel } from "./ManualFieldsPanel";
import { PreviewModal } from "./PreviewModal";
import { cn } from "@/lib/utils";

// ── Autosave state label ───────────────────────────────────────────────────────
function AutosaveLabel({
  state,
  lastSavedAt,
}: {
  state: string;
  lastSavedAt: Date | null;
}) {
  if (state === "saving") {
    return (
      <span className="text-xs text-muted-foreground animate-pulse">Saving…</span>
    );
  }
  if (state === "error") {
    return <span className="text-xs text-red-600">Error saving</span>;
  }
  if (state === "dirty") {
    return <span className="text-xs text-amber-600">Unsaved</span>;
  }
  if (state === "saved" && lastSavedAt) {
    const secs = Math.round((Date.now() - lastSavedAt.getTime()) / 1000);
    const label = secs < 5 ? "just now" : `${secs}s ago`;
    return <span className="text-xs text-green-600">Saved {label}</span>;
  }
  return <span className="text-xs text-muted-foreground">Saved</span>;
}

// ── Toolbar button helper ──────────────────────────────────────────────────────
function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "p-1.5 rounded text-sm hover:bg-surface",
        active && "bg-surface text-brand"
      )}
    >
      {children}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function TemplateEditor({ templateId }: { templateId: string }) {
  const { data: template, isLoading, error, refetch } = useContractTemplate(templateId);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [contentJson, setContentJson] = useState<unknown>({ type: "doc", content: [] });
  const [manualFields, setManualFields] = useState<ManualField[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      MergeTagNode,
    ],
    content: { type: "doc", content: [] },
    editorProps: {
      attributes: { class: "prose max-w-none focus:outline-none min-h-[400px] p-4" },
    },
    onUpdate: ({ editor: e }) => setContentJson(e.getJSON()),
    immediatelyRender: false, // SSR safety in Next 16
  });

  // Hydrate state from server data (once)
  useEffect(() => {
    if (template && !isLoaded) {
      setName(template.name);
      setStatus(template.status);
      setContentJson(template.contentJson);
      setManualFields(template.manualFields ?? []);
      setIsLoaded(true);
    }
  }, [template, isLoaded]);

  // Hydrate editor content after editor + template are ready
  useEffect(() => {
    if (editor && template && isLoaded) {
      editor.commands.setContent(template.contentJson as object);
    }
    // Only run when editor first mounts and template loads — not on every content change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, isLoaded]);

  const autosave = useTemplateAutosave({
    templateId,
    value: { name, contentJson, manualFields, status },
    enabled: isLoaded,
    onError: (e) => toast({ variant: "destructive", description: e.message }),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="p-6">
        <ErrorState error={error ?? new Error("Template not found")} onRetry={refetch} />
      </div>
    );
  }

  const insertMergeTag = (key: string) => {
    editor?.chain().focus().insertContent({ type: "mergeTag", attrs: { key } }).run();
  };

  const insertTable = () => {
    editor
      ?.chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
  };

  const insertLink = () => {
    const url = window.prompt("Enter URL");
    if (!url) return;
    editor?.chain().focus().setLink({ href: url }).run();
  };

  // Page break: insert raw HTML as a stand-in (v2 will add a proper PageBreakNode)
  // StarterKit includes HorizontalRule; we repurpose it here as a visual page-break indicator
  const insertPageBreak = () => {
    editor?.chain().focus().setHorizontalRule().run();
  };

  return (
    <>
      {/* Merge-tag chip styles */}
      <style>{`
        .merge-tag-chip {
          display: inline-block;
          background: #dbeafe;
          color: #1e40af;
          border-radius: 4px;
          padding: 1px 6px;
          font-size: 0.85em;
          font-family: ui-monospace, monospace;
        }
        .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
        }
        .ProseMirror td, .ProseMirror th {
          border: 1px solid #e2e8f0;
          padding: 6px 10px;
          min-width: 60px;
        }
        .ProseMirror th {
          background: #f8fafc;
          font-weight: 600;
        }
      `}</style>

      <div className="flex flex-col h-full bg-background">
        {/* ── Header ── */}
        <header className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-[200px] text-base font-semibold bg-transparent border-b border-transparent hover:border-border focus:border-brand focus:outline-none py-0.5 transition-colors"
            placeholder="Template name"
          />

          <div className="flex items-center gap-2 ml-auto">
            <AutosaveLabel state={autosave.state} lastSavedAt={autosave.lastSavedAt} />

            {/* Status toggle */}
            <button
              type="button"
              onClick={() => setStatus((s) => (s === "active" ? "disabled" : "active"))}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                status === "active"
                  ? "bg-green-100 text-green-800 hover:bg-green-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {status === "active" ? "Active" : "Disabled"}
            </button>

            {/* Preview */}
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand text-white rounded hover:bg-brand/90 transition-colors"
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
          </div>
        </header>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden flex-col sm:flex-row">
          {/* Left: editor */}
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-0.5 px-3 py-1.5 border-b border-border bg-card overflow-x-auto">
              {/* Headings */}
              <ToolbarBtn
                title="Paragraph"
                active={editor?.isActive("paragraph")}
                onClick={() => editor?.chain().focus().setParagraph().run()}
              >
                <span className="text-xs font-medium px-0.5">P</span>
              </ToolbarBtn>
              <ToolbarBtn
                title="Heading 1"
                active={editor?.isActive("heading", { level: 1 })}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
              >
                <span className="text-xs font-bold px-0.5">H1</span>
              </ToolbarBtn>
              <ToolbarBtn
                title="Heading 2"
                active={editor?.isActive("heading", { level: 2 })}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              >
                <span className="text-xs font-bold px-0.5">H2</span>
              </ToolbarBtn>
              <ToolbarBtn
                title="Heading 3"
                active={editor?.isActive("heading", { level: 3 })}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
              >
                <span className="text-xs font-bold px-0.5">H3</span>
              </ToolbarBtn>

              <span className="w-px h-5 bg-border mx-1" />

              {/* Marks */}
              <ToolbarBtn
                title="Bold"
                active={editor?.isActive("bold")}
                onClick={() => editor?.chain().focus().toggleBold().run()}
              >
                <Bold className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn
                title="Italic"
                active={editor?.isActive("italic")}
                onClick={() => editor?.chain().focus().toggleItalic().run()}
              >
                <Italic className="w-4 h-4" />
              </ToolbarBtn>
              {/* Note: @tiptap/extension-underline not installed — omitted in v1 */}
              <ToolbarBtn
                title="Strikethrough"
                active={editor?.isActive("strike")}
                onClick={() => editor?.chain().focus().toggleStrike().run()}
              >
                <Strikethrough className="w-4 h-4" />
              </ToolbarBtn>

              <span className="w-px h-5 bg-border mx-1" />

              {/* Lists */}
              <ToolbarBtn
                title="Bullet list"
                active={editor?.isActive("bulletList")}
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
              >
                <List className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn
                title="Ordered list"
                active={editor?.isActive("orderedList")}
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              >
                <ListOrdered className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn
                title="Blockquote"
                active={editor?.isActive("blockquote")}
                onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              >
                <Quote className="w-4 h-4" />
              </ToolbarBtn>

              <span className="w-px h-5 bg-border mx-1" />

              {/* Alignment */}
              <ToolbarBtn
                title="Align left"
                active={editor?.isActive({ textAlign: "left" })}
                onClick={() => editor?.chain().focus().setTextAlign("left").run()}
              >
                <AlignLeft className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn
                title="Align center"
                active={editor?.isActive({ textAlign: "center" })}
                onClick={() => editor?.chain().focus().setTextAlign("center").run()}
              >
                <AlignCenter className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn
                title="Align right"
                active={editor?.isActive({ textAlign: "right" })}
                onClick={() => editor?.chain().focus().setTextAlign("right").run()}
              >
                <AlignRight className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn
                title="Justify"
                active={editor?.isActive({ textAlign: "justify" })}
                onClick={() => editor?.chain().focus().setTextAlign("justify").run()}
              >
                <AlignJustify className="w-4 h-4" />
              </ToolbarBtn>

              <span className="w-px h-5 bg-border mx-1" />

              {/* Extras */}
              <ToolbarBtn title="Insert link" onClick={insertLink}>
                <Link2 className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn title="Insert table (3×3)" onClick={insertTable}>
                <TableIcon className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn title="Page break" onClick={insertPageBreak}>
                <span className="text-xs font-medium px-0.5">⏎</span>
              </ToolbarBtn>
            </div>

            {/* Editor area */}
            <div className="flex-1 overflow-y-auto">
              <EditorContent editor={editor} />
            </div>

            {/* Manual fields panel (full width below editor) */}
            <ManualFieldsPanel value={manualFields} onChange={setManualFields} />
          </div>

          {/* Right: merge-tag panel (280px) */}
          <div className="w-full sm:w-[280px] shrink-0 overflow-y-auto border-t sm:border-t-0 sm:border-l border-border">
            <MergeTagPanel onInsert={insertMergeTag} manualFields={manualFields} />
          </div>
        </div>
      </div>

      {/* Preview modal */}
      {showPreview && (
        <PreviewModal
          templateId={templateId}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
