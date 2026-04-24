"use client";

import { useState } from "react";
import { Copy, Check, X } from "lucide-react";

/**
 * Claude Prompt Helper — modal Akram opens in Section 2 (Parent Avatar) to
 * copy-paste a structured prompt into Claude with the centre's current
 * snapshot as context. Claude returns a draft parent avatar; Akram pastes
 * the JSON back in, reviews, saves.
 */
export function ClaudePromptModal({
  open,
  onClose,
  centreName,
  snapshot,
}: {
  open: boolean;
  onClose: () => void;
  centreName: string;
  snapshot: unknown;
}) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const prompt = buildPrompt(centreName, snapshot);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — user can select+copy manually
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div
          className="w-full max-w-2xl rounded-xl bg-card shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between border-b px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Draft a Parent Avatar with Claude
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Copy this prompt into Claude. Paste the JSON response back into
                the Parent Avatar editor and review before saving.
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
            <textarea
              readOnly
              value={prompt}
              rows={20}
              className="w-full rounded-lg border border-border bg-surface/40 px-3 py-2 text-xs font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-surface"
            >
              Close
            </button>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy prompt
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function buildPrompt(centreName: string, snapshot: unknown): string {
  const snapshotJson = JSON.stringify(snapshot ?? {}, null, 2);
  return `You are helping the Amana OSHC marketing team draft a Parent Avatar for the ${centreName} centre.

The Parent Avatar captures who the typical family is, what they want, what stops them enrolling, and how we should communicate.

Here is the current centre snapshot (numbers, school context, parent drivers, programme focus):

\`\`\`json
${snapshotJson}
\`\`\`

Based on this context plus general knowledge about OSHC (Out of School Hours Care) families in Australian communities, produce a draft Parent Avatar as a JSON object with this exact shape:

\`\`\`json
{
  "demographics": {
    "ageRange": "",
    "familyStructure": "",
    "income": "",
    "education": "",
    "occupations": "",
    "languages": ""
  },
  "psychographics": {
    "primaryConcern": "",
    "primaryWant": "",
    "topObjections": "",
    "enrolTrigger": "",
    "dealBreaker": ""
  },
  "decisionMaking": {
    "whoDecides": "",
    "influencers": "",
    "timeline": ""
  },
  "commPreferences": {
    "channel": "",
    "frequency": "",
    "tone": "",
    "language": ""
  },
  "culturalSensitivities": "",
  "competition": "",
  "communityDynamics": ""
}
\`\`\`

Guidelines:
- Write in plain, operator-friendly language. Short sentences.
- Ground every claim in the snapshot where possible.
- If you need to infer, mark the inference explicitly (e.g., "likely: ...").
- Leave a field empty only if there is truly no basis to guess.
- Return ONLY the JSON — no preamble, no explanation.`;
}
