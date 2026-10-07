"use client";

/**
 * "I've read it" bar on the Staff Handbook and The Amana Way pages — ticks
 * the reading step on the My Portal checklist (2026-10-07). Hidden once
 * confirmed. Shown to everyone who opens the page; the confirmation is only
 * ever about the signed-in user.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";

export function ReadConfirmBar({
  doc,
  label,
  alreadyRead,
}: {
  doc: "handbook" | "amana-way";
  label: string;
  alreadyRead: boolean;
}) {
  const qc = useQueryClient();
  const [done, setDone] = useState(alreadyRead);
  const confirm = useMutation({
    mutationFn: () => mutateApi("/api/my-portal/reading", { method: "POST", body: { doc } }),
    onSuccess: () => {
      setDone(true);
      qc.invalidateQueries({ queryKey: ["get-ready"] });
      toast({ description: `Thanks — ${label} ticked off your checklist` });
    },
    onError: (err: Error) => toast({ variant: "destructive", description: err.message }),
  });

  if (done) return null;
  return (
    <div
      // The handbook bodies are full-bleed (negative top margin) — clear it.
      className="relative z-10 mb-6 md:mb-10 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3"
      data-testid={`read-confirm-${doc}`}
    >
      <p className="flex-1 text-sm text-foreground">
        Read through {label}, then let us know you&apos;re done — it&apos;s one of your steps before your first shift.
      </p>
      <Button size="sm" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
        <CheckCircle2 className="w-4 h-4" aria-hidden />
        {confirm.isPending ? "Saving…" : "I've read it"}
      </Button>
    </div>
  );
}
