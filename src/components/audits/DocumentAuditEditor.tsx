"use client";

/**
 * Inline editor for document-mode audits.
 *
 * Loads the template's source DOCX (converted to HTML by mammoth on
 * the server) or a previously saved draft, lets the coordinator edit
 * it inside the dashboard with a TipTap toolbar, and saves the
 * filled-in HTML to AuditInstance.completedHtml. The template's
 * source document is never mutated — each instance carries its own
 * completed copy, so the original keeps cycling for the next period.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import LinkExt from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  Table as TableIcon,
  Loader2,
  Save,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  AlertTriangle,
  AlertCircle,
  Info,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

interface DocumentAuditEditorProps {
  auditId: string;
  templateName: string;
  serviceName: string;
  dueDate: string;
  status: string;
  onBack: () => void;
}

interface AuditFlagItem {
  title: string;
  severity: "high" | "medium" | "low";
  snippet: string;
}

interface DocumentResponse {
  html: string;
  source: "saved" | "template";
  sourceFileName: string | null;
  aiFlags: AuditFlagItem[] | null;
  aiSummary: string | null;
  aiScannedAt: string | null;
}

function ToolbarBtn({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "p-1.5 rounded text-sm hover:bg-surface text-muted",
        active && "bg-brand/10 text-brand",
        disabled && "opacity-40 cursor-not-allowed hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}

export function DocumentAuditEditor({
  auditId,
  templateName,
  serviceName,
  dueDate,
  status,
  onBack,
}: DocumentAuditEditorProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const [hydrated, setHydrated] = useState(false);
  const isCompleted = status === "completed";

  const docQuery = useQuery({
    queryKey: ["audit-document", auditId],
    queryFn: () =>
      fetchApi<DocumentResponse>(`/api/audits/${auditId}/document`),
    staleTime: Infinity,
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      LinkExt.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: "",
    editable: !isCompleted,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose max-w-none focus:outline-none min-h-[60vh] px-6 py-8 bg-card rounded-b-xl",
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor && docQuery.data && !hydrated) {
      editor.commands.setContent(docQuery.data.html || "<p></p>");
      setHydrated(true);
    }
  }, [editor, docQuery.data, hydrated]);

  const saveDraft = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error("Editor not ready");
      return mutateApi(`/api/audits/${auditId}/document`, {
        method: "PATCH",
        body: { completedHtml: editor.getHTML() },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit", auditId] });
      qc.invalidateQueries({ queryKey: ["audit-instances"] });
      toast({ description: "Draft saved." });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const completeMut = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error("Editor not ready");
      return mutateApi(`/api/audits/${auditId}/document`, {
        method: "PATCH",
        body: { completedHtml: editor.getHTML(), complete: true },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit", auditId] });
      qc.invalidateQueries({ queryKey: ["audit-instances"] });
      toast({ description: "Audit marked complete." });
      router.push("/compliance");
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const handleComplete = () => {
    const proceed = confirm(
      "Mark this audit complete? The filled-in document will be saved on this instance and the next scheduled audit will roll over on cadence. The template document stays untouched.",
    );
    if (!proceed) return;
    completeMut.mutate();
  };

  if (docQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  if (docQuery.error) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <p className="text-sm text-red-600 mb-3">
          {docQuery.error instanceof Error ? docQuery.error.message : "Failed to load document"}
        </p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-24 space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-card rounded-xl border border-border shadow-sm p-5">
        <div>
          <h1 className="text-xl font-bold text-foreground">{templateName}</h1>
          <p className="text-xs text-muted mt-0.5">
            {serviceName} · Due {new Date(dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
            {docQuery.data?.source === "template" && (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                Fresh copy of template
              </span>
            )}
            {docQuery.data?.source === "saved" && !isCompleted && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                Resuming saved draft
              </span>
            )}
            {isCompleted && (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                <CheckCircle2 className="w-3 h-3" /> Completed (read-only)
              </span>
            )}
          </p>
        </div>
        <p className="text-xs text-muted mt-3 leading-relaxed">
          Edit the audit directly below — what you save is stored on this
          instance only. The original template document doesn't change, so the
          next scheduled audit starts from a clean copy.
        </p>
      </div>

      {docQuery.data?.aiSummary && (
        <AiFlagsPanel
          flags={docQuery.data.aiFlags ?? []}
          summary={docQuery.data.aiSummary}
          scannedAt={docQuery.data.aiScannedAt}
        />
      )}

      {editor && !isCompleted && (
        <div className="bg-card border border-border rounded-t-xl px-3 py-2 flex flex-wrap items-center gap-1 sticky top-0 z-10">
          <ToolbarBtn title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
            <Undo2 className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
            <Redo2 className="w-4 h-4" />
          </ToolbarBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolbarBtn title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            <Heading1 className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 className="w-4 h-4" />
          </ToolbarBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolbarBtn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough className="w-4 h-4" />
          </ToolbarBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolbarBtn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote className="w-4 h-4" />
          </ToolbarBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolbarBtn title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
            <AlignLeft className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
            <AlignCenter className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
            <AlignRight className="w-4 h-4" />
          </ToolbarBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolbarBtn
            title="Insert table"
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            <TableIcon className="w-4 h-4" />
          </ToolbarBtn>
        </div>
      )}

      <div className={cn("border border-border bg-card", editor && !isCompleted ? "border-t-0 rounded-b-xl" : "rounded-xl")}>
        <EditorContent editor={editor} />
      </div>

      {!isCompleted && (
        <div className="sticky bottom-4 z-10 mx-auto max-w-fit bg-card border border-border rounded-full shadow-lg px-3 py-2 flex items-center gap-2">
          <button
            onClick={() => saveDraft.mutate()}
            disabled={saveDraft.isPending || completeMut.isPending}
            className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-foreground border border-border rounded-full hover:bg-surface disabled:opacity-50"
          >
            {saveDraft.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save draft
          </button>
          <button
            onClick={handleComplete}
            disabled={saveDraft.isPending || completeMut.isPending}
            className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white bg-brand rounded-full hover:bg-brand/90 disabled:opacity-50"
          >
            {completeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Complete audit
          </button>
        </div>
      )}
    </div>
  );
}

function AiFlagsPanel({
  flags,
  summary,
  scannedAt,
}: {
  flags: AuditFlagItem[];
  summary: string;
  scannedAt: string | null;
}) {
  const high = flags.filter((f) => f.severity === "high");
  const medium = flags.filter((f) => f.severity === "medium");
  const low = flags.filter((f) => f.severity === "low");

  const accent = high.length
    ? "border-red-200 bg-red-50/60"
    : medium.length
      ? "border-amber-200 bg-amber-50/60"
      : flags.length
        ? "border-blue-200 bg-blue-50/60"
        : "border-emerald-200 bg-emerald-50/60";

  return (
    <div className={cn("rounded-xl border p-4 space-y-3", accent)}>
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-brand" />
        <p className="text-sm font-semibold text-foreground">
          AI review of this audit
        </p>
        {scannedAt && (
          <span className="text-[11px] text-muted ml-auto">
            Scanned{" "}
            {new Date(scannedAt).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        )}
      </div>

      <p className="text-sm text-foreground/80 leading-relaxed">{summary}</p>

      {flags.length > 0 && (
        <ul className="space-y-2">
          {flags.map((f, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2 bg-card/70 border border-border rounded-lg p-2.5"
            >
              <SeverityIcon severity={f.severity} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{f.title}</p>
                {f.snippet && (
                  <p className="text-xs text-muted mt-0.5 italic line-clamp-3">
                    &ldquo;{f.snippet}&rdquo;
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {flags.length === 0 && (
        <p className="text-xs text-muted italic">
          No follow-up items flagged — the AI didn't find anything that needs leadership attention.
        </p>
      )}
    </div>
  );
}

function SeverityIcon({ severity }: { severity: "high" | "medium" | "low" }) {
  if (severity === "high") {
    return <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />;
  }
  if (severity === "medium") {
    return <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />;
  }
  return <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />;
}
