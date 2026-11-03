"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { mutateApi } from "@/lib/fetch-api";

export function PrivateTranscriptForm({ meetingId }: { meetingId: string }) {
  // A different meeting must never inherit an unsaved sensitive draft.
  return <TranscriptEditor key={meetingId} meetingId={meetingId} />;
}

function TranscriptEditor({ meetingId }: { meetingId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);
  const query = useQueryClient();

  useEffect(() => {
    if (!text.trim()) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [text]);

  return (
    <form className="space-y-3 border-b border-border p-4" onSubmit={async event => {
      event.preventDefault();
      if (submitting.current) return;
      if (!text.trim()) { setError("Add your meeting notes before saving."); return; }
      submitting.current = true;
      setBusy(true); setError(""); setSaved(false);
      try {
        await mutateApi(`/api/meetings/${meetingId}/transcripts`, { method: "POST", body: { text } });
        setText(""); setSaved(true);
        // A failed list refresh must not label an already-saved note as unsaved.
        void query.invalidateQueries({ queryKey: ["meeting-recordings", meetingId] }).catch(() => {});
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save your notes. Please try again.");
      } finally { submitting.current = false; setBusy(false); }
    }}>
      <p className="text-sm text-muted" id={`notes-privacy-${meetingId}`}>Only people with access to this meeting can open these notes. They are not sent to an AI provider.</p>
      <label className="block text-sm font-medium text-foreground">Written notes or transcript
        <textarea value={text} onChange={event => { setText(event.target.value); setSaved(false); setError(""); }} readOnly={busy} maxLength={200000} rows={5} aria-describedby={`notes-privacy-${meetingId} notes-draft-${meetingId}`} className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-foreground" placeholder="Record decisions, actions and who will follow up." />
      </label>
      <p id={`notes-draft-${meetingId}`} className="text-xs text-muted">Save before leaving this meeting. Unsaved notes are not kept on this device.</p>
      {error && <div role="alert" className="rounded-lg border border-border bg-surface p-3 text-sm text-foreground"><p>{error}</p><p className="mt-1">Your notes are still above. You can try saving again.</p></div>}
      {saved && <p role="status" className="text-sm font-medium text-brand">Notes saved privately. Find them in the meeting records below.</p>}
      <Button type="submit" loading={busy} className="w-full sm:w-auto">{busy ? "Saving notes…" : "Save privately"}</Button>
    </form>
  );
}
