"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Send, Clock, Eye, Settings2, ChevronDown, ChevronUp } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import EmailBlockEditor from "./EmailBlockEditor";
import EmailHtmlEditor from "./EmailHtmlEditor";
import EmailPreview from "./EmailPreview";
import TemplatePickerModal from "./TemplatePickerModal";
import {
  useSendEmail,
  useEmailPreview,
  useEmailTemplate,
  type EmailTemplateData,
} from "@/hooks/useEmailTemplates";
import type { EmailBlock, EmailLayoutOptions } from "@/lib/email-marketing-layout";

export function EmailComposer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const postId = searchParams.get("postId");
  const templateIdParam = searchParams.get("templateId");

  // ── State ──────────────────────────────────────────────────
  const [subject, setSubject] = useState("");
  const [blocks, setBlocks] = useState<EmailBlock[]>([
    { type: "text", content: "" },
  ]);
  const [htmlContent, setHtmlContent] = useState("");
  const [mode, setMode] = useState<"blocks" | "html">("blocks");

  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [allCentres, setAllCentres] = useState(true);
  const [scheduledAt, setScheduledAt] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);

  const [previewHtml, setPreviewHtml] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [showLayoutSettings, setShowLayoutSettings] = useState(false);
  const [layoutOptions, setLayoutOptions] = useState<EmailLayoutOptions>({
    headerColor: "#004E64",
    headerText: "Amana OSHC",
    headerLogoUrl: "",
    footerText: "Amana OSHC",
    footerUrl: "https://amanaoshc.com.au",
    footerUrlLabel: "amanaoshc.com.au",
    showUnsubscribe: true,
  });

  // ── Post pre-fill ──────────────────────────────────────────
  const { data: postData } = useQuery({
    queryKey: ["marketing-post", postId],
    queryFn: () =>
      fetch(`/api/marketing/posts/${postId}`).then((r) => r.json()),
    enabled: !!postId,
  });

  useEffect(() => {
    if (postData) {
      setSubject(postData.title);
      if (postData.content) {
        setBlocks([{ type: "text", content: postData.content }]);
      }
    }
  }, [postData]);

  // ── Template apply ─────────────────────────────────────────
  const { data: templateData } = useEmailTemplate(templateIdParam);

  useEffect(() => {
    if (templateData) {
      applyTemplate(templateData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateData]);

  const applyTemplate = useCallback((template: EmailTemplateData) => {
    if (template.subject) setSubject(template.subject);
    if (template.blocks && Array.isArray(template.blocks)) {
      setBlocks(template.blocks as EmailBlock[]);
      setMode("blocks");
    } else if (template.htmlContent) {
      setHtmlContent(template.htmlContent);
      setMode("html");
    }
  }, []);

  // ── Live preview (debounced) ───────────────────────────────
  const previewMutation = useEmailPreview();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Build a minimal preview request — the preview endpoint takes a templateId
      // but we also support rendering ad-hoc blocks by posting content directly.
      // For now we render client-side using the layout util for instant preview.
      import("@/lib/email-marketing-layout").then(
        ({ renderBlocksToHtml, marketingLayout }) => {
          if (mode === "blocks") {
            setPreviewHtml(renderBlocksToHtml(blocks, undefined, layoutOptions));
          } else {
            setPreviewHtml(marketingLayout(htmlContent, layoutOptions));
          }
        },
      );
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [blocks, htmlContent, mode, layoutOptions]);

  // ── Services list ──────────────────────────────────────────
  const { data: services } = useQuery<
    { id: string; name: string; code: string }[]
  >({
    queryKey: ["services-list"],
    queryFn: async () => {
      const res = await fetch("/api/services?status=active");
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((s: Record<string, unknown>) => ({
        id: s.id,
        name: s.name,
        code: s.code,
      }));
    },
  });

  // ── Recipient count ────────────────────────────────────────
  const { data: recipientCount } = useQuery<number>({
    queryKey: ["recipient-count", allCentres, selectedServiceIds],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (!allCentres && selectedServiceIds.length > 0) {
        selectedServiceIds.forEach((id) => params.append("serviceId", id));
      }
      const res = await fetch(
        `/api/email/recipient-count?${params.toString()}`,
      );
      if (!res.ok) return 0;
      const data = await res.json();
      return data.count;
    },
  });

  // ── Send ───────────────────────────────────────────────────
  const sendMutation = useSendEmail();

  function handleConfirmSend() {
    sendMutation.mutate(
      {
        templateId: templateIdParam || "",
        serviceIds: allCentres ? undefined : selectedServiceIds,
        subject,
      },
      {
        onSuccess: () => {
          router.push("/marketing");
        },
        onError: (err) => {
          toast({ description: err.message || "Failed to send email" });
        },
      },
    );
    setConfirmSend(false);
  }

  function toggleService(id: string) {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  const centreCount = allCentres
    ? services?.length ?? 0
    : selectedServiceIds.length;

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/marketing")}
            className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">
            Compose Email
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplatePicker(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-hover"
          >
            Templates
          </button>
          <button
            onClick={() => setConfirmSend(true)}
            disabled={!subject.trim() || sendMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {showSchedule && scheduledAt ? (
              <>
                <Clock className="h-4 w-4" />
                Schedule
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send
              </>
            )}
          </button>
        </div>
      </div>

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left pane — editor */}
        <div className="w-1/2 overflow-y-auto border-r border-border p-6">
          {/* Subject */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-foreground">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Mode toggle */}
          <div className="mb-4 flex gap-1 rounded-lg bg-hover p-1">
            <button
              onClick={() => setMode("blocks")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                mode === "blocks"
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Block Editor
            </button>
            <button
              onClick={() => setMode("html")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                mode === "html"
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              HTML
            </button>
          </div>

          {/* Editor */}
          <div className="mb-6">
            {mode === "blocks" ? (
              <EmailBlockEditor blocks={blocks} onChange={setBlocks} />
            ) : (
              <EmailHtmlEditor value={htmlContent} onChange={setHtmlContent} />
            )}
          </div>

          {/* Header & Footer Settings */}
          <div className="mb-6 rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setShowLayoutSettings(!showLayoutSettings)}
              className="w-full flex items-center justify-between p-4 hover:bg-hover/50 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Settings2 className="h-4 w-4 text-brand" />
                Header & Footer
              </span>
              {showLayoutSettings ? (
                <ChevronUp className="h-4 w-4 text-muted" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted" />
              )}
            </button>
            {showLayoutSettings && (
              <div className="border-t border-border p-4 space-y-4">
                {/* Header */}
                <div>
                  <p className="text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-2">Header</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-muted">Header Text</label>
                      <input
                        type="text"
                        value={layoutOptions.headerText || ""}
                        onChange={(e) => setLayoutOptions((prev) => ({ ...prev, headerText: e.target.value }))}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">Background Colour</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={layoutOptions.headerColor || "#004E64"}
                          onChange={(e) => setLayoutOptions((prev) => ({ ...prev, headerColor: e.target.value }))}
                          className="h-8 w-10 cursor-pointer rounded border border-border"
                        />
                        <input
                          type="text"
                          value={layoutOptions.headerColor || "#004E64"}
                          onChange={(e) => setLayoutOptions((prev) => ({ ...prev, headerColor: e.target.value }))}
                          className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-mono focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="mb-1 block text-xs text-muted">Logo URL (optional — replaces text)</label>
                    <input
                      type="text"
                      value={layoutOptions.headerLogoUrl || ""}
                      onChange={(e) => setLayoutOptions((prev) => ({ ...prev, headerLogoUrl: e.target.value }))}
                      placeholder="https://example.com/logo.png"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </div>
                </div>

                {/* Footer */}
                <div>
                  <p className="text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-2">Footer</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-muted">Company Name</label>
                      <input
                        type="text"
                        value={layoutOptions.footerText || ""}
                        onChange={(e) => setLayoutOptions((prev) => ({ ...prev, footerText: e.target.value }))}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">Website Label</label>
                      <input
                        type="text"
                        value={layoutOptions.footerUrlLabel || ""}
                        onChange={(e) => setLayoutOptions((prev) => ({ ...prev, footerUrlLabel: e.target.value }))}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="mb-1 block text-xs text-muted">Website URL</label>
                    <input
                      type="text"
                      value={layoutOptions.footerUrl || ""}
                      onChange={(e) => setLayoutOptions((prev) => ({ ...prev, footerUrl: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={layoutOptions.showUnsubscribe !== false}
                      onChange={(e) => setLayoutOptions((prev) => ({ ...prev, showUnsubscribe: e.target.checked }))}
                      className="rounded border-border text-brand focus:ring-brand"
                    />
                    Show unsubscribe link
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Recipients */}
          <div className="mb-6 rounded-lg border border-border p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Recipients
            </h3>
            <label className="mb-2 flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={allCentres}
                onChange={(e) => {
                  setAllCentres(e.target.checked);
                  if (e.target.checked) setSelectedServiceIds([]);
                }}
                className="rounded border-border text-brand focus:ring-brand"
              />
              All Centres
            </label>

            {!allCentres && services && (
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pl-1">
                {services.map((svc) => (
                  <label
                    key={svc.id}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={selectedServiceIds.includes(svc.id)}
                      onChange={() => toggleService(svc.id)}
                      className="rounded border-border text-brand focus:ring-brand"
                    />
                    {svc.name}{" "}
                    <span className="text-xs text-muted">({svc.code})</span>
                  </label>
                ))}
              </div>
            )}

            <p className="mt-3 text-xs text-muted">
              <Eye className="mr-1 inline-block h-3 w-3" />
              {recipientCount ?? "..."} recipient(s) across {centreCount}{" "}
              centre(s)
            </p>
          </div>

          {/* Schedule */}
          <div className="rounded-lg border border-border p-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={showSchedule}
                onChange={(e) => setShowSchedule(e.target.checked)}
                className="rounded border-border text-brand focus:ring-brand"
              />
              <Clock className="h-4 w-4 text-muted" />
              Schedule for later
            </label>
            {showSchedule && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            )}
          </div>
        </div>

        {/* Right pane — preview */}
        <div className="w-1/2 overflow-y-auto bg-hover/30 p-6">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Preview
          </h3>
          <EmailPreview html={previewHtml} />
        </div>
      </div>

      {/* Template picker modal */}
      <TemplatePickerModal
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        onSelect={(template) => {
          applyTemplate(template);
          setShowTemplatePicker(false);
        }}
      />

      {/* Confirm send dialog */}
      {confirmSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              Confirm Send
            </h2>
            <p className="mb-6 text-sm text-muted">
              Send to {recipientCount ?? "..."} recipients across {centreCount}{" "}
              centres? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmSend(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSend}
                disabled={sendMutation.isPending}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {sendMutation.isPending ? "Sending..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
