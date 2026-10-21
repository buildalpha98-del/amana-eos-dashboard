"use client";

/**
 * Reveal a family's full bank details, with "confirm it's you" first
 * (security brief 2026-10-21, batch 2 — src/lib/recent-auth.ts).
 *
 * `useBankReveal(enrolmentId)` asks the reveal route; when it answers 428
 * RECENT_AUTH_REQUIRED, the dialog asks for the password (and the
 * authenticator code when MFA is on), confirms, and retries once. Revealed
 * values live in React state only — never the query cache, storage or the
 * URL — and clear themselves after a minute.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";

export interface RevealedBank {
  method: "bank_account";
  accountName?: string;
  bsb?: string;
  accountNumber?: string;
}

const AUTO_HIDE_MS = 60_000;

async function askReveal(enrolmentId: string) {
  const res = await fetch(`/api/enrolments/${enrolmentId}/payment`, { method: "POST", cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export function useBankReveal(enrolmentId: string | null | undefined) {
  const [revealed, setRevealed] = useState<RevealedBank | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<{ mfa: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRevealed(null);
  }, []);
  useEffect(() => hide, [hide]);

  const run = useCallback(async () => {
    if (!enrolmentId) return;
    setLoading(true);
    try {
      const { status, body } = await askReveal(enrolmentId);
      if (status === 428 && body?.details?.code === "RECENT_AUTH_REQUIRED") {
        setConfirm({ mfa: body.details.mfa === true });
        return;
      }
      if (status >= 400) throw new Error(body?.error ?? "Couldn't reveal the details");
      setRevealed(body as RevealedBank);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setRevealed(null), AUTO_HIDE_MS);
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Couldn't reveal the details" });
    } finally {
      setLoading(false);
    }
  }, [enrolmentId]);

  const dialog = (
    <ConfirmIdentityDialog
      open={!!confirm}
      mfa={confirm?.mfa ?? false}
      onClose={() => setConfirm(null)}
      onConfirmed={() => {
        setConfirm(null);
        void run();
      }}
    />
  );

  return { revealed, loading, reveal: run, hide, dialog };
}

function ConfirmIdentityDialog({
  open,
  mfa,
  onClose,
  onConfirmed,
}: {
  open: boolean;
  mfa: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPassword("");
    setCode("");
    setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/confirm-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, mfaCode: mfa ? code : undefined, purpose: "payment_reveal" }),
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "That didn't work. Try again.");
        return;
      }
      reset();
      onConfirmed();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent size="sm">
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand" /> Confirm it&apos;s you
        </DialogTitle>
        <DialogDescription>
          Full bank details are only shown after you re-enter your password{mfa ? " and authenticator code" : ""}. This
          lasts five minutes, and every reveal is recorded.
        </DialogDescription>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (password && (!mfa || code)) void submit();
          }}
        >
          <label className="block text-sm">
            <span className="text-muted">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              autoFocus
            />
          </label>
          {mfa && (
            <label className="block text-sm">
              <span className="text-muted">Authenticator or backup code</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !password || (mfa && !code)} iconLeft={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
              Confirm
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
