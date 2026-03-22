"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Loader2 } from "lucide-react";
import EmailPreview from "@/components/email/EmailPreview";
import {
  useEmailTemplates,
  useEmailPreview,
  useSendEmail,
} from "@/hooks/useEmailTemplates";

interface Props {
  open: boolean;
  onClose: () => void;
  enquiry: {
    id: string;
    parentName: string;
    parentEmail: string | null;
    service: { id: string; name: string; code: string };
  };
}

const HARDCODED_BODY =
  "Dear {{parentName}},\n\nThank you for your enquiry about {{serviceName}}. We are delighted that you are considering our service for your family.\n\nOur team will be in touch shortly to discuss your child's needs and how we can best support them.\n\nWarm regards,\nAmana OSHC";

function interpolate(
  text: string,
  enquiry: Props["enquiry"],
): string {
  return text
    .replace(/\{\{parentName\}\}/g, enquiry.parentName)
    .replace(/\{\{parentFirstName\}\}/g, enquiry.parentName.split(" ")[0])
    .replace(/\{\{serviceName\}\}/g, enquiry.service.name)
    .replace(/\{\{serviceCode\}\}/g, enquiry.service.code)
    .replace(
      /\{\{enquiryDate\}\}/g,
      new Date().toLocaleDateString("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    );
}

function buildVariables(
  enquiry: Props["enquiry"],
): Record<string, string> {
  return {
    parentName: enquiry.parentName,
    parentFirstName: enquiry.parentName.split(" ")[0],
    serviceName: enquiry.service.name,
    serviceCode: enquiry.service.code,
    enquiryDate: new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  };
}

export function SendWelcomeEmailModal({
  open,
  onClose,
  enquiry,
}: Props) {
  const { data: templates, isLoading: templatesLoading } =
    useEmailTemplates("welcome");
  const previewMutation = useEmailPreview();
  const sendMutation = useSendEmail();

  const defaultTemplate =
    templates?.find((t) => t.isDefault) ?? templates?.[0] ?? null;

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialise subject and body once template loads
  useEffect(() => {
    if (defaultTemplate) {
      setSubject(
        interpolate(
          defaultTemplate.subject || `Welcome to Amana OSHC — ${enquiry.service.name}`,
          enquiry,
        ),
      );
      // Use template htmlContent as the editable body (strip tags for plain editing)
      const raw = defaultTemplate.htmlContent || HARDCODED_BODY;
      setBody(interpolate(raw, enquiry));
    } else if (!templatesLoading) {
      setSubject(`Welcome to Amana OSHC — ${enquiry.service.name}`);
      setBody(interpolate(HARDCODED_BODY, enquiry));
    }
    // Only run when template data arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTemplate, templatesLoading]);

  // Debounced preview
  const refreshPreview = useCallback(
    (sub: string, bodyText: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const vars = buildVariables(enquiry);
        if (defaultTemplate) {
          previewMutation.mutate(
            { templateId: defaultTemplate.id, variables: vars },
            { onSuccess: (res) => setPreviewHtml(res.html) },
          );
        } else {
          // Use the edited body as inline HTML
          const htmlBody = bodyText.replace(/\n/g, "<br/>");
          previewMutation.mutate(
            { htmlContent: htmlBody, variables: vars },
            { onSuccess: (res) => setPreviewHtml(res.html) },
          );
        }
      }, 300);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultTemplate, enquiry],
  );

  // Trigger preview on body/subject change
  useEffect(() => {
    if (body) refreshPreview(subject, body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, subject]);

  // Cleanup debounce
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSend = () => {
    if (!enquiry.parentEmail) return;
    const vars = buildVariables(enquiry);
    sendMutation.mutate(
      {
        templateId: defaultTemplate?.id ?? null,
        subject,
        htmlContent: defaultTemplate ? null : body.replace(/\n/g, "<br/>"),
        enquiryId: enquiry.id,
        variables: vars,
      },
      {
        onSuccess: () => {
          onClose();
        },
      },
    );
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-[60]"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="bg-card rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="text-base font-semibold text-foreground">
              Send Welcome Email
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-surface"
            >
              <X className="h-5 w-5 text-muted" />
            </button>
          </div>

          {/* Body — split panes */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left pane — edit */}
            <div className="w-1/2 border-r overflow-y-auto p-5 space-y-4">
              {/* To */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  To
                </label>
                <input
                  type="email"
                  value={enquiry.parentEmail ?? "No email address"}
                  disabled
                  className="w-full rounded-md border border-border bg-surface/50 px-3 py-2 text-sm text-muted"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:ring-brand focus:border-brand"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Body
                </label>
                <textarea
                  rows={12}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:ring-brand focus:border-brand"
                />
              </div>

              {/* Template indicator */}
              <p className="text-xs text-muted">
                {defaultTemplate
                  ? `Using template: ${defaultTemplate.name}`
                  : "Using default welcome message"}
              </p>
            </div>

            {/* Right pane — preview */}
            <div className="w-1/2 overflow-y-auto p-5 bg-surface/50">
              <h3 className="text-xs font-medium text-muted mb-3 uppercase tracking-wide">
                Preview
              </h3>
              {previewMutation.isPending && !previewHtml ? (
                <div className="flex items-center justify-center h-64 text-muted">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <EmailPreview html={previewHtml} />
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t bg-surface/50">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/80 bg-card border border-border hover:bg-surface"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={
                !enquiry.parentEmail ||
                !subject.trim() ||
                sendMutation.isPending
              }
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sendMutation.isPending ? "Sending..." : "Send Email"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
