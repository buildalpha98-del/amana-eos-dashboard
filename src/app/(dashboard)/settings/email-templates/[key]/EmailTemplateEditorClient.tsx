"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Save, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "@/hooks/useToast";
import type { EmailTemplateManifestEntry } from "@/lib/email-template-manifest";
import { interpolateTemplate } from "@/lib/email-template-manifest";

interface Override {
  subject: string;
  body: string;
}

interface Props {
  manifest: EmailTemplateManifestEntry;
  initialOverride: Override | null;
}

export function EmailTemplateEditorClient({ manifest, initialOverride }: Props) {
  const router = useRouter();
  const [subject, setSubject] = useState(initialOverride?.subject ?? "");
  const [body, setBody] = useState(initialOverride?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const hasOverride = !!initialOverride;
  const dirty = subject !== (initialOverride?.subject ?? "") || body !== (initialOverride?.body ?? "");

  async function handleSave() {
    if (subject.trim().length === 0 || body.trim().length === 0) {
      toast({
        variant: "destructive",
        description: "Subject and body cannot be blank",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/email-template-overrides/${encodeURIComponent(manifest.key)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subject, body }),
        },
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || `Save failed (${res.status})`);
      }
      toast({ description: "Template override saved." });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to save",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Remove the override and revert this template to the code default?",
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch(
        `/api/email-template-overrides/${encodeURIComponent(manifest.key)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || `Reset failed (${res.status})`);
      }
      setSubject("");
      setBody("");
      toast({ description: "Template reverted to default." });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to reset",
      });
    } finally {
      setResetting(false);
    }
  }

  // Build a sample variables map for the preview — variable values are the
  // variable name in {curly braces} so admins can see where each one lands.
  const previewVars: Record<string, string> = {};
  for (const v of manifest.variables) {
    previewVars[v.name] = `[${v.name}]`;
  }
  // Helper-rendered values (like `signInButton`, `resetButton`) — admin
  // doesn't see these in the variables list because they're internal, but
  // a placeholder keeps the preview from rendering literal `{{name}}`.
  const knownInternalHelpers = ["signInButton", "resetButton"];
  for (const helper of knownInternalHelpers) {
    if (!previewVars[helper]) {
      previewVars[helper] =
        `<button style="background:#004E64;color:#fff;padding:8px 12px;border-radius:4px;">[${helper}]</button>`;
    }
  }

  const previewSubject = interpolateTemplate(subject, previewVars);
  const previewBody = interpolateTemplate(body, previewVars);

  return (
    <div className="space-y-6">
      <Link
        href="/settings/email-templates"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to all templates
      </Link>

      <PageHeader
        title={manifest.label}
        description={manifest.description}
        badge={hasOverride ? "Overridden" : undefined}
      />

      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Available variables
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {manifest.variables.map((v) => (
            <div
              key={v.name}
              className="rounded-md border border-border bg-surface/40 px-3 py-2"
            >
              <code className="text-xs font-mono text-foreground">{`{{${v.name}}}`}</code>
              <div className="text-xs text-muted">{v.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <label className="space-y-1.5 block">
          <span className="text-sm font-medium text-foreground">Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Use {{variable}} for substitutions"
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </label>
        <label className="space-y-1.5 block">
          <span className="text-sm font-medium text-foreground">
            Body (HTML, inner content — shared header / footer applied automatically)
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={18}
            placeholder="HTML body content with {{variable}} placeholders"
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/40 resize-y"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save override
        </Button>
        {hasOverride && (
          <Button variant="ghost" onClick={handleReset} disabled={resetting}>
            {resetting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Reset to default
          </Button>
        )}
        <Button variant="ghost" onClick={() => setShowPreview((p) => !p)}>
          {showPreview ? "Hide preview" : "Show preview"}
        </Button>
      </div>

      {showPreview && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Preview</h2>
          <div className="rounded-md border border-border bg-surface/40 px-3 py-2 text-xs font-mono text-muted">
            <strong className="text-foreground">Subject:</strong> {previewSubject}
          </div>
          <div
            className="rounded-md border border-border bg-card p-4 max-w-2xl"
            // Body is preview-only; admin-authored. Saved at PATCH-time only by owner/admin.
            dangerouslySetInnerHTML={{ __html: previewBody }}
          />
          <p className="text-xs text-muted">
            Variable values shown as <code>[name]</code>; actual sends substitute live data.
          </p>
        </div>
      )}
    </div>
  );
}
