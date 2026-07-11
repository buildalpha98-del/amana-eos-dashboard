"use client";

/**
 * Admin inline preview + editor for a document-mode audit template.
 *
 * Replaces the structured-checklist UI when the template is in
 * doc-mode. Reads the master template HTML (cached on the template
 * after first mammoth conversion) and lets the admin tweak it in
 * TipTap — saves persist as the template's `sourceHtml`, which
 * becomes the starting content for every future scheduled instance.
 */

import { useEffect, useState } from "react";
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
  Eye,
  Pencil,
  Info,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

interface Props {
  templateId: string;
  templateName: string;
}

interface DocumentResponse {
  html: string;
  source: "cached" | "converted";
  sourceFileName: string | null;
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

export function TemplateDocumentEditor({ templateId, templateName }: Props) {
  const qc = useQueryClient();
  const [hydrated, setHydrated] = useState(false);
  const [editing, setEditing] = useState(false);

  const docQuery = useQuery({
    queryKey: ["audit-template-document", templateId],
    queryFn: () =>
      fetchApi<DocumentResponse>(`/api/audits/templates/${templateId}/document`),
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
    editable: editing,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose max-w-none focus:outline-none min-h-[40vh] px-6 py-6 bg-card",
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

  useEffect(() => {
    if (editor) editor.setEditable(editing);
  }, [editor, editing]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error("Editor not ready");
      return mutateApi(`/api/audits/templates/${templateId}/document`, {
        method: "PATCH",
        body: { sourceHtml: editor.getHTML() },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-template-document", templateId] });
      qc.invalidateQueries({ queryKey: ["audit-templates"] });
      toast({
        description:
          "Template saved. New scheduled audits use this version; in-flight + completed audits keep their own copy.",
      });
      setEditing(false);
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  if (docQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  if (docQuery.error) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">
          {docQuery.error instanceof Error
            ? docQuery.error.message
            : "Failed to load template document"}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface/30">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Info className="w-3.5 h-3.5" />
          {editing ? (
            <span>
              Editing master template — changes apply to <strong>future</strong> scheduled audits only.
            </span>
          ) : (
            <span>Preview only — click <strong>Edit master</strong> to update for future audits.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50"
              >
                {saveMut.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Save template
              </button>
              <button
                onClick={() => {
                  if (editor && docQuery.data) {
                    editor.commands.setContent(docQuery.data.html || "<p></p>");
                  }
                  setEditing(false);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted rounded-md border border-border hover:bg-surface"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand border border-brand/30 rounded-md hover:bg-brand/5"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit master
            </button>
          )}
        </div>
      </div>

      {editor && editing && (
        <div className="bg-card border-b border-border px-3 py-2 flex flex-wrap items-center gap-1">
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

      <div className="bg-card max-h-[600px] overflow-y-auto border-t border-border">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
