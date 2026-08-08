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
import AudienceManagerModal from "./AudienceManagerModal";
import {
  useSendEmail,
  useTestSend,
  useEmailTemplate,
  useAudiences,
  type EmailTemplateData,
} from "@/hooks/useEmailTemplates";
import {
  pickTouchedLayoutOptions,
  resolveTouchedLayoutKeys,
} from "@/lib/email-layout-schema";
import { Button } from "@/components/ui/Button";
import type { EmailBlock, EmailLayoutOptions } from "@/lib/email-marketing-layout";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { useFormDraft } from "@/hooks/useFormDraft";
import { UnsavedBadge } from "@/components/ui/UnsavedBadge";
import { fetchApi } from "@/lib/fetch-api";

// Static fallback for the Header & Footer panel — used until the org config
// loads (or if the fetch fails). Matches the server's code defaults, so a
// pristine panel approximates what an untouched send will render.
const FALLBACK_LAYOUT: EmailLayoutOptions = {
  headerColor: "#004E64",
  headerText: "Amana OSHC",
  headerLogoUrl: "",
  footerText: "Amana OSHC",
  footerUrl: "https://amanaoshc.com.au",
  footerUrlLabel: "amanaoshc.com.au",
  showUnsubscribe: true,
};

export function EmailComposer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const postId = searchParams.get("postId");
  const campaignIdParam = searchParams.get("campaignId");
  const templateIdParam = searchParams.get("templateId");

  // ── Draft autosave ────────────────────────────────────────
  const initialDraft = {
    subject: "",
    blocks: JSON.stringify([{ type: "text", content: "" }]),
    htmlContent: "",
    mode: "blocks" as "blocks" | "html",
    // Layout settings persist as a PLAIN object (unlike blocks, which the
    // draft stores JSON-stringified) — be consistent on restore.
    layoutOptions: FALLBACK_LAYOUT,
    touchedLayoutKeys: [] as string[],
  };
  const {
    data: draft,
    updateField: updateDraft,
    clearDraft,
  } = useFormDraft("email-compose", initialDraft);

  // ── State (seeded from draft) ─────────────────────────────
  const [subject, setSubject] = useState(draft.subject);
  const [blocks, setBlocks] = useState<EmailBlock[]>(() => {
    try {
      return JSON.parse(draft.blocks) as EmailBlock[];
    } catch {
      return [{ type: "text", content: "" }];
    }
  });
  const [htmlContent, setHtmlContent] = useState(draft.htmlContent);
  const [mode, setMode] = useState<"blocks" | "html">(draft.mode);

  const [recipientMode, setRecipientMode] = useState<
    "all" | "pick" | "audience"
  >("all");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [audienceId, setAudienceId] = useState<string | null>(null);
  const [showAudienceManager, setShowAudienceManager] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);

  const [previewHtml, setPreviewHtml] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [showLayoutSettings, setShowLayoutSettings] = useState(false);
  // Branding-seeded + PER-FIELD touch tracking: the panel starts from org
  // branding (or a restored draft), and every user edit records its field in
  // `touchedKeys`. Sends carry ONLY the touched fields — untouched fields
  // are omitted so the server's `{ ...branding, ...layoutOptions }` merge
  // keeps them tracking live org branding (shipping the whole seeded panel
  // would freeze branding at the seed: edit just the footer text and the
  // header colour would revert to the seed's value forever).
  const [layoutOptions, setLayoutOptions] = useState<EmailLayoutOptions>(
    () => draft.layoutOptions ?? FALLBACK_LAYOUT,
  );
  const [touchedKeys, setTouchedKeys] = useState<string[]>(() =>
    // Handles legacy drafts (boolean layoutDirty, no touchedLayoutKeys) —
    // see resolveTouchedLayoutKeys for the conservative fallback.
    resolveTouchedLayoutKeys(draft),
  );
  const layoutDirty = touchedKeys.length > 0;

  const updateLayoutOption = useCallback(
    (patch: Partial<EmailLayoutOptions>) => {
      setTouchedKeys((prev) => {
        const next = new Set(prev);
        for (const key of Object.keys(patch)) next.add(key);
        return [...next];
      });
      setLayoutOptions((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  // Seed the panel from live org branding while PRISTINE. This GET is open
  // to any authed user (unlike /api/org-settings, which is role-gated away
  // from marketing users) and its `branding` slice comes from the SAME
  // getEmailBranding() source the send routes use — so an untouched panel
  // previews exactly what an untouched send will render. Once the user
  // touches any field, the seed never overwrites their edits.
  const { data: orgConfig } = useQuery<{
    branding?: {
      name?: string;
      primaryColor?: string;
      websiteUrl?: string;
      websiteUrlLabel?: string;
    };
  }>({
    queryKey: ["org-settings-config"],
    queryFn: () => fetchApi("/api/org-settings/config"),
    retry: 2,
    staleTime: 300_000,
  });

  useEffect(() => {
    if (touchedKeys.length > 0) return;
    const branding = orgConfig?.branding;
    if (!branding) return;
    setLayoutOptions((prev) => ({
      ...prev,
      ...(branding.name
        ? { headerText: branding.name, footerText: branding.name }
        : {}),
      ...(branding.primaryColor
        ? { headerColor: branding.primaryColor }
        : {}),
      ...(branding.websiteUrl ? { footerUrl: branding.websiteUrl } : {}),
      ...(branding.websiteUrlLabel
        ? { footerUrlLabel: branding.websiteUrlLabel }
        : {}),
    }));
  }, [orgConfig, touchedKeys]);

  // ── Sync state → draft for autosave ────────────────────────
  useEffect(() => {
    updateDraft("subject", subject);
  }, [subject, updateDraft]);

  useEffect(() => {
    updateDraft("blocks", JSON.stringify(blocks));
  }, [blocks, updateDraft]);

  useEffect(() => {
    updateDraft("htmlContent", htmlContent);
  }, [htmlContent, updateDraft]);

  useEffect(() => {
    updateDraft("mode", mode);
  }, [mode, updateDraft]);

  // Only persist layout settings once the user has actually edited them —
  // while pristine, the branding seed may differ from the draft's initial
  // literals, and syncing it would create a spurious "Draft restored" on
  // the next mount for a user who typed nothing.
  useEffect(() => {
    if (touchedKeys.length === 0) return;
    updateDraft("layoutOptions", layoutOptions);
    updateDraft("touchedLayoutKeys", touchedKeys);
  }, [touchedKeys, layoutOptions, updateDraft]);

  // ── Unsaved changes warning ──────────────────────────────
  const emailIsDirty = subject.trim().length > 0 || blocks.some((b) => "content" in b && (b.content as string)?.trim().length > 0) || htmlContent.trim().length > 0;
  useUnsavedChanges(emailIsDirty);

  // ── Post pre-fill ──────────────────────────────────────────
  const { data: postData } = useQuery<{
    id: string;
    title: string;
    content?: string | null;
  }>({
    queryKey: ["marketing-post", postId],
    queryFn: () =>
      fetch(`/api/marketing/posts/${postId}`).then((r) => r.json()),
    enabled: !!postId,
    // Prevent background refetches from re-seeding the editor mid-edit
    // (Bug #8 — same class of bug as Bug #7's Weekly Pulse regression).
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Hydrate editor state from the source post exactly once per postId. Using
  // the object ref as a dep is what caused Bug #8 — a refetch returned a new
  // ref, the effect re-ran, and the user's in-progress edits were clobbered.
  const loadedPostIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!postData?.id) return;
    if (loadedPostIdRef.current === postData.id) return;
    loadedPostIdRef.current = postData.id;

    setSubject(postData.title);
    if (postData.content) {
      setBlocks([{ type: "text", content: postData.content }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postData?.id]);

  // ── Template apply ─────────────────────────────────────────
  const { data: templateData } = useEmailTemplate(templateIdParam);

  // Hydrate editor state from the template exactly once per templateId. Same
  // Bug #8 fix: key off the stable id instead of the object ref so background
  // refetches (which return a new ref) don't overwrite the user's edits.
  const loadedTemplateIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!templateData?.id) return;
    if (loadedTemplateIdRef.current === templateData.id) return;
    loadedTemplateIdRef.current = templateData.id;
    applyTemplate(templateData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateData?.id]);

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

  // ── Saved audiences ────────────────────────────────────────
  const { data: audiences } = useAudiences();

  // Clear a selected audience that no longer exists (e.g. archived from the
  // manager modal) so a stale id can't ride along into the send payload.
  useEffect(() => {
    if (!audienceId || !Array.isArray(audiences)) return;
    if (!audiences.some((a) => a.id === audienceId)) {
      setAudienceId(null);
    }
  }, [audienceId, audiences]);

  // Recipients need a concrete selection before counting/sending makes sense:
  // audience mode needs an audience picked, and pick mode needs ≥1 centre —
  // empty serviceIds would read as ABSENT server-side and silently target ALL
  // subscribed contacts while the summary claims "0 centre(s)".
  const recipientsReady =
    recipientMode === "audience"
      ? !!audienceId
      : recipientMode === "pick"
        ? selectedServiceIds.length > 0
        : true;

  // ── Recipient count ────────────────────────────────────────
  const { data: recipientCount } = useQuery<number>({
    queryKey: [
      "recipient-count",
      recipientMode,
      selectedServiceIds.join(","),
      audienceId ?? "",
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (recipientMode === "audience" && audienceId) {
        params.set("audienceId", audienceId);
      } else if (recipientMode === "pick" && selectedServiceIds.length > 0) {
        selectedServiceIds.forEach((id) => params.append("serviceId", id));
      }
      const res = await fetch(
        `/api/email/recipient-count?${params.toString()}`,
      );
      if (!res.ok) return 0;
      const data = await res.json();
      return data.count;
    },
    enabled: recipientsReady,
  });

  // ── Send ───────────────────────────────────────────────────
  const sendMutation = useSendEmail();
  const testSendMutation = useTestSend();

  // The editor state is always the source of truth: any template picked via
  // ?templateId= has already been hydrated into blocks/htmlContent (and may
  // have been edited since), so we send the composed content — never the
  // templateId, which the campaign route would resolve FIRST, silently
  // discarding the user's edits.
  // ONLY the touched layout fields ride along — untouched fields (and a
  // fully untouched panel) are omitted, so the server renders them from its
  // live org-branding base and future branding changes keep applying.
  const composedContent = {
    ...(mode === "blocks" ? { blocks } : { htmlContent }),
    ...(layoutDirty
      ? { layoutOptions: pickTouchedLayoutOptions(layoutOptions, touchedKeys) }
      : {}),
  };

  function handleTestSend() {
    testSendMutation.mutate({ subject, ...composedContent });
  }

  function handleConfirmSend() {
    // Exactly ONE recipient shape goes out: audienceId | allCentres | serviceIds.
    // The API's refine tolerates allCentres:false/[] alongside audienceId, but
    // keep the legacy fields out entirely when an audience is selected.
    sendMutation.mutate(
      {
        subject,
        ...composedContent,
        ...(recipientMode === "audience" && audienceId
          ? { audienceId }
          : recipientMode === "all"
            ? { allCentres: true }
            : { serviceIds: selectedServiceIds }),
        ...(showSchedule && scheduledAt
          ? { scheduledAt: new Date(scheduledAt).toISOString() }
          : {}),
        ...(postId ? { postId } : {}),
        // Campaign umbrella link — the send route allows at most one of
        // postId / marketingCampaignId, so postId wins when both are present.
        ...(!postId && campaignIdParam
          ? { marketingCampaignId: campaignIdParam }
          : {}),
      },
      {
        onSuccess: () => {
          clearDraft();
          router.push("/marketing");
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            description: err.message || "Failed to send email",
          });
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

  const centreCount =
    recipientMode === "all" ? services?.length ?? 0 : selectedServiceIds.length;

  const audienceList = Array.isArray(audiences) ? audiences : [];
  const selectedAudience = audienceList.find((a) => a.id === audienceId);

  const recipientSummary =
    recipientMode === "audience"
      ? `${recipientCount ?? "..."} recipient(s) in "${selectedAudience?.name ?? "—"}"`
      : `${recipientCount ?? "..."} recipient(s) across ${centreCount} centre(s)`;

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
          {emailIsDirty && <UnsavedBadge />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplatePicker(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-hover"
          >
            Templates
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestSend}
            disabled={!subject.trim() || testSendMutation.isPending}
            loading={testSendMutation.isPending}
          >
            Send test to me
          </Button>
          <button
            onClick={() => setConfirmSend(true)}
            disabled={!subject.trim() || !recipientsReady || sendMutation.isPending}
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
                        onChange={(e) => updateLayoutOption({ headerText: e.target.value })}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">Background Colour</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={layoutOptions.headerColor || "#004E64"}
                          onChange={(e) => updateLayoutOption({ headerColor: e.target.value })}
                          className="h-8 w-10 cursor-pointer rounded border border-border"
                        />
                        <input
                          type="text"
                          value={layoutOptions.headerColor || "#004E64"}
                          onChange={(e) => updateLayoutOption({ headerColor: e.target.value })}
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
                      onChange={(e) => updateLayoutOption({ headerLogoUrl: e.target.value })}
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
                        onChange={(e) => updateLayoutOption({ footerText: e.target.value })}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">Website Label</label>
                      <input
                        type="text"
                        value={layoutOptions.footerUrlLabel || ""}
                        onChange={(e) => updateLayoutOption({ footerUrlLabel: e.target.value })}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="mb-1 block text-xs text-muted">Website URL</label>
                    <input
                      type="text"
                      value={layoutOptions.footerUrl || ""}
                      onChange={(e) => updateLayoutOption({ footerUrl: e.target.value })}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={layoutOptions.showUnsubscribe !== false}
                      onChange={(e) => updateLayoutOption({ showUnsubscribe: e.target.checked })}
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

            {/* Mode toggle */}
            <div
              role="radiogroup"
              aria-label="Recipient selection mode"
              className="mb-3 flex gap-1 rounded-lg bg-hover p-1"
            >
              {(
                [
                  { value: "all", label: "All centres" },
                  { value: "pick", label: "Pick centres" },
                  { value: "audience", label: "Saved audience" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={recipientMode === opt.value}
                  onClick={() => setRecipientMode(opt.value)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    recipientMode === opt.value
                      ? "bg-surface text-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {recipientMode === "pick" && services && (
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

            {recipientMode === "audience" && (
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={audienceId ?? ""}
                  onChange={(e) => setAudienceId(e.target.value || null)}
                  aria-label="Saved audience"
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  <option value="">Select an audience...</option>
                  {audienceList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAudienceManager(true)}
                >
                  Manage audiences
                </Button>
              </div>
            )}

            <p className="mt-3 text-xs text-muted">
              <Eye className="mr-1 inline-block h-3 w-3" />
              {recipientsReady
                ? recipientSummary
                : recipientMode === "audience"
                  ? "Select an audience to see the recipient count"
                  : "Pick at least one centre to see the recipient count"}
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

      {/* Audience manager modal */}
      <AudienceManagerModal
        open={showAudienceManager}
        onClose={() => setShowAudienceManager(false)}
      />

      {/* Confirm send dialog */}
      {confirmSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              Confirm Send
            </h2>
            <p className="mb-6 text-sm text-muted">
              Send to {recipientSummary}? This cannot be undone.
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
