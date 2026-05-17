"use client";

/**
 * Bulk editor — single page showing every template in a category as an
 * accordion. Each entry expands to a subject input + body textarea +
 * Save / Reset buttons that hit the existing
 * /api/email-template-overrides/[key] endpoint.
 *
 * Built so marketing can scan + edit a sequence in one sitting instead of
 * navigating between per-template pages. Each entry's dirty state +
 * save status is tracked independently so a stale save on one template
 * doesn't lose unsaved drafts on another.
 *
 * 2026-05-17.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Save,
  Loader2,
  RotateCcw,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "@/hooks/useToast";
import {
  interpolateTemplate,
  type EmailTemplateManifestEntry,
} from "@/lib/email-template-manifest";

interface Override {
  subject: string;
  body: string;
}

type Row = EmailTemplateManifestEntry & { override: Override | null };

interface Props {
  category: string;
  rows: Row[];
}

interface DraftState {
  /** Draft subject (admin edits live here until Save). */
  subject: string;
  /** Draft body. */
  body: string;
  /** Original server-known override. Used to compute `dirty`. */
  serverSubject: string;
  serverBody: string;
  /** Is the entry currently expanded? */
  expanded: boolean;
  /** Save in flight? */
  saving: boolean;
  /** Reset in flight? */
  resetting: boolean;
  /** Has the entry got a persisted override (= the badge shows). */
  hasOverride: boolean;
}

export function BulkEditorClient({ category, rows }: Props) {
  const router = useRouter();

  // Per-template state map keyed by template key.
  const [drafts, setDrafts] = useState<Record<string, DraftState>>(() => {
    const init: Record<string, DraftState> = {};
    for (const row of rows) {
      init[row.key] = {
        subject: row.override?.subject ?? "",
        body: row.override?.body ?? "",
        serverSubject: row.override?.subject ?? "",
        serverBody: row.override?.body ?? "",
        expanded: false,
        saving: false,
        resetting: false,
        hasOverride: !!row.override,
      };
    }
    return init;
  });

  const dirtyKeys = Object.entries(drafts).filter(
    ([, d]) => d.subject !== d.serverSubject || d.body !== d.serverBody,
  );
  const overrideCount = Object.values(drafts).filter((d) => d.hasOverride).length;

  function toggle(key: string) {
    setDrafts((d) => ({ ...d, [key]: { ...d[key], expanded: !d[key].expanded } }));
  }

  function expandAll() {
    setDrafts((d) => {
      const next: typeof d = {};
      for (const [k, v] of Object.entries(d)) next[k] = { ...v, expanded: true };
      return next;
    });
  }

  function collapseAll() {
    setDrafts((d) => {
      const next: typeof d = {};
      for (const [k, v] of Object.entries(d)) next[k] = { ...v, expanded: false };
      return next;
    });
  }

  async function save(key: string) {
    const d = drafts[key];
    if (!d) return;
    if (d.subject.trim().length === 0 || d.body.trim().length === 0) {
      toast({
        variant: "destructive",
        description: "Subject and body cannot be blank",
      });
      return;
    }
    setDrafts((s) => ({ ...s, [key]: { ...s[key], saving: true } }));
    try {
      const res = await fetch(
        `/api/email-template-overrides/${encodeURIComponent(key)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subject: d.subject, body: d.body }),
        },
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || `Save failed (${res.status})`);
      }
      setDrafts((s) => ({
        ...s,
        [key]: {
          ...s[key],
          serverSubject: d.subject,
          serverBody: d.body,
          hasOverride: true,
          saving: false,
        },
      }));
      toast({ description: `Saved override for ${rows.find((r) => r.key === key)?.label}.` });
      router.refresh();
    } catch (err) {
      setDrafts((s) => ({ ...s, [key]: { ...s[key], saving: false } }));
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Save failed",
      });
    }
  }

  async function reset(key: string) {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Remove the override and revert this template to the code default?")
    ) {
      return;
    }
    setDrafts((s) => ({ ...s, [key]: { ...s[key], resetting: true } }));
    try {
      const res = await fetch(
        `/api/email-template-overrides/${encodeURIComponent(key)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || `Reset failed (${res.status})`);
      }
      setDrafts((s) => ({
        ...s,
        [key]: {
          ...s[key],
          subject: "",
          body: "",
          serverSubject: "",
          serverBody: "",
          hasOverride: false,
          resetting: false,
        },
      }));
      toast({ description: "Reverted to default." });
      router.refresh();
    } catch (err) {
      setDrafts((s) => ({ ...s, [key]: { ...s[key], resetting: false } }));
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Reset failed",
      });
    }
  }

  async function saveAll() {
    const keysToSave = dirtyKeys.map(([k]) => k);
    if (keysToSave.length === 0) return;
    for (const key of keysToSave) {
      // Sequential not parallel — easier for the user to track failures and
      // matches the existing per-template rate limit (30/min).
      // eslint-disable-next-line no-await-in-loop
      await save(key);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/settings/email-templates"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to all categories
      </Link>

      <PageHeader
        title={`${category} — bulk editor`}
        description={`Edit subject + body for every ${category} template on one page. ${rows.length} templates total · ${overrideCount} with active override · ${dirtyKeys.length} with unsaved changes.`}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={expandAll}>
          Expand all
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>
          Collapse all
        </Button>
        <div className="flex-1" />
        <Button
          variant="primary"
          size="sm"
          onClick={saveAll}
          disabled={dirtyKeys.length === 0}
        >
          <Save className="h-3.5 w-3.5" />
          Save all changes ({dirtyKeys.length})
        </Button>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const d = drafts[row.key];
          const dirty = d.subject !== d.serverSubject || d.body !== d.serverBody;
          // Preview values: placeholder shown as [name].
          const previewVars: Record<string, string> = {};
          for (const v of row.variables) previewVars[v.name] = `[${v.name}]`;
          previewVars.signInButton =
            '<button style="background:#004E64;color:#fff;padding:6px 10px;border-radius:4px;">[signInButton]</button>';
          previewVars.resetButton =
            '<button style="background:#004E64;color:#fff;padding:6px 10px;border-radius:4px;">[resetButton]</button>';
          previewVars.startButton =
            '<button style="background:#004E64;color:#fff;padding:6px 10px;border-radius:4px;">[startButton]</button>';
          const effectiveSubject = d.subject || row.override?.subject || "(default subject — see code)";
          const effectiveBody = d.body || row.override?.body || "";

          return (
            <div
              key={row.key}
              className={`rounded-lg border ${
                dirty
                  ? "border-brand bg-brand/5"
                  : d.hasOverride
                    ? "border-brand/40"
                    : "border-border"
              } bg-card overflow-hidden`}
            >
              <button
                type="button"
                onClick={() => toggle(row.key)}
                className="w-full flex items-start gap-3 p-4 text-left hover:bg-surface/40 transition-colors"
              >
                <span className="text-muted mt-0.5">
                  {d.expanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">
                      {row.label}
                    </span>
                    {d.hasOverride && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold bg-brand/15 text-brand px-1.5 py-0.5 rounded">
                        Overridden
                      </span>
                    )}
                    {dirty && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold bg-amber-500/20 text-amber-700 px-1.5 py-0.5 rounded">
                        Unsaved
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted mt-0.5">{row.description}</div>
                  <code className="text-[10px] font-mono text-muted/70 mt-1 block">
                    {row.key}
                  </code>
                </div>
              </button>

              {d.expanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-border">
                  <div className="pt-3">
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted hover:text-foreground">
                        Available variables ({row.variables.length})
                      </summary>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {row.variables.map((v) => (
                          <div
                            key={v.name}
                            className="rounded-md border border-border bg-surface/40 px-2 py-1"
                          >
                            <code className="text-[11px] font-mono text-foreground">{`{{${v.name}}}`}</code>
                            <div className="text-[10px] text-muted">{v.description}</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-foreground">Subject</span>
                    <input
                      type="text"
                      value={d.subject}
                      onChange={(e) =>
                        setDrafts((s) => ({
                          ...s,
                          [row.key]: { ...s[row.key], subject: e.target.value },
                        }))
                      }
                      placeholder="Use {{variable}} for substitutions"
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-foreground">
                      Body (HTML inner content)
                    </span>
                    <textarea
                      value={d.body}
                      onChange={(e) =>
                        setDrafts((s) => ({
                          ...s,
                          [row.key]: { ...s[row.key], body: e.target.value },
                        }))
                      }
                      rows={14}
                      placeholder="HTML body with {{variable}} placeholders"
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/40 resize-y"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => save(row.key)}
                      disabled={!dirty || d.saving}
                    >
                      {d.saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save
                    </Button>
                    {d.hasOverride && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => reset(row.key)}
                        disabled={d.resetting}
                      >
                        {d.resetting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        Reset to default
                      </Button>
                    )}
                    {!dirty && d.hasOverride && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <Check className="h-3 w-3" />
                        Saved
                      </span>
                    )}
                  </div>

                  {effectiveBody && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
                        Preview
                      </summary>
                      <div className="mt-2 rounded-md border border-border bg-surface/30 px-3 py-2 text-xs font-mono text-muted">
                        <strong className="text-foreground">Subject:</strong>{" "}
                        {interpolateTemplate(effectiveSubject, previewVars)}
                      </div>
                      <div
                        className="mt-2 rounded-md border border-border bg-white p-4 max-w-2xl text-sm"
                        dangerouslySetInnerHTML={{
                          __html: interpolateTemplate(effectiveBody, previewVars),
                        }}
                      />
                    </details>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
