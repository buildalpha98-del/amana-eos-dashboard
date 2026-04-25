"use client";

import { useState } from "react";
import type { NetworkPostSummary } from "@/hooks/useWhatsAppCompliance";
import { useCreateNetworkPost, useDeleteNetworkPost } from "@/hooks/useWhatsAppCompliance";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import { Plus, Trash2 } from "lucide-react";
import type { WhatsAppNetworkGroup } from "@prisma/client";

interface NetworkGroupPanelProps {
  group: WhatsAppNetworkGroup;
  title: string;
  count: number;
  target: number;
  floor: number;
  posts: NetworkPostSummary[];
}

function ragColour(count: number, target: number, floor: number): string {
  if (count >= target) return "bg-green-500";
  if (count >= floor) return "bg-amber-500";
  return "bg-red-500";
}

function nowLocalDateTime(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function NetworkGroupPanel({ group, title, count, target, floor, posts }: NetworkGroupPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [postedAt, setPostedAt] = useState(nowLocalDateTime());
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");

  const create = useCreateNetworkPost();
  const del = useDeleteNetworkPost();

  const onCreate = async () => {
    try {
      await create.mutateAsync({
        group,
        postedAt: new Date(postedAt).toISOString(),
        topic: topic.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast({ description: `${title} post logged` });
      setShowForm(false);
      setTopic("");
      setNotes("");
      setPostedAt(nowLocalDateTime());
    } catch {
      // hook handles toast
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this post?")) return;
    try {
      await del.mutateAsync(id);
      toast({ description: "Post deleted" });
    } catch {
      // hook handles toast
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${ragColour(count, target, floor)}`}
            aria-hidden
          />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <span className="text-xs text-muted">
          {count}/{target} this week (floor {floor})
        </span>
      </header>

      {posts.length === 0 ? (
        <p className="text-xs text-muted py-2">No posts logged this week.</p>
      ) : (
        <ul className="space-y-1.5">
          {posts.map((p) => (
            <li
              key={p.id}
              className="flex items-start justify-between gap-2 rounded-md border border-border p-2 text-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted">{new Date(p.postedAt).toLocaleString("en-AU")}</div>
                <div className="text-foreground truncate">{p.topic ?? "(no topic)"}</div>
                {p.notes && <div className="text-xs text-muted mt-1">{p.notes}</div>}
              </div>
              <button
                type="button"
                onClick={() => onDelete(p.id)}
                disabled={del.isPending}
                className="text-muted hover:text-red-600 p-1"
                aria-label="Delete post"
                title="Delete post"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-xs">
              <span className="text-muted">Posted at</span>
              <input
                type="datetime-local"
                value={postedAt}
                onChange={(e) => setPostedAt(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-card p-1.5 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="text-muted">Topic</span>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Holiday programme reminder"
                className="mt-1 w-full rounded-md border border-border bg-card p-1.5 text-sm"
              />
            </label>
          </div>
          <label className="block text-xs">
            <span className="text-muted">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-border bg-card p-1.5 text-sm"
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={onCreate} loading={create.isPending}>
              Log post
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowForm(true)}
          iconLeft={<Plus className="w-4 h-4" />}
        >
          Log {title.toLowerCase()} post
        </Button>
      )}
    </section>
  );
}
