"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export function PrivateTranscriptForm({ meetingId }: { meetingId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQueryClient();
  return <form className="space-y-3 border-b border-border p-4" onSubmit={async e => {
    e.preventDefault(); setBusy(true);
    try {
      await mutateApi(`/api/meetings/${meetingId}/transcripts`, { method: "POST", body: { text } });
      setText("");
      await query.invalidateQueries({ queryKey: ["meeting-recordings", meetingId] });
      toast({ description: "Meeting notes saved privately." });
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Couldn't save your notes." });
    } finally { setBusy(false); }
  }}>
    <p className="text-sm text-muted">External AI processing is blocked. These notes stay in private storage and are only available to people with access to this meeting.</p>
    <label className="block text-sm font-medium">Written notes or transcript
      <textarea value={text} onChange={e => setText(e.target.value)} maxLength={200000} rows={5} className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-foreground" />
    </label>
    <Button type="submit" disabled={busy || !text.trim()} loading={busy}>Save privately</Button>
  </form>;
}
