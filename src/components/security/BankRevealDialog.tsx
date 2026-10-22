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
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
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
  const currentEnrolment = useRef(enrolmentId);
  currentEnrolment.current = enrolmentId;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRevealed(null);
  }, []);
  useEffect(() => { hide(); setConfirm(null); return hide; }, [hide, enrolmentId]);

  const run = useCallback(async () => {
    if (!enrolmentId) return;
    setLoading(true);
    try {
      const { status, body } = await askReveal(enrolmentId);
      if (currentEnrolment.current !== enrolmentId) return;
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

export function ConfirmIdentityDialog({ open, mfa, onClose, onConfirmed, purpose = "payment_reveal" }: {
  open: boolean; mfa: boolean; onClose: () => void; onConfirmed: () => void;
  purpose?: "payment_reveal" | "payment_change" | "passkey_setup";
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"loading" | "password" | "register" | "authenticate">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) { setPassword(""); setCode(""); setError(null); return; }
    let current = true;
    setStage("loading");
    void fetch("/api/auth/passkeys", { cache: "no-store" }).then(async res => {
      if (!res.ok) throw new Error("Couldn't check your passkeys. Close this window and try again.");
      const keys = await res.json();
      if (current) setStage(keys.length ? "authenticate" : "password");
    }).catch(err => { if (current) setError(err.message); });
    return () => { current = false; };
  }, [open]);

  const request = async (url: string, data: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), cache: "no-store" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Confirmation failed. Please try again.");
    return body;
  };
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (stage === "password") {
        await request("/api/auth/confirm-identity", { password, mfaCode: mfa ? code : undefined, purpose: "passkey_setup" });
        setPassword(""); setCode(""); setStage("register");
        return;
      }
      const operation = stage === "register" ? "register" : "authenticate";
      const begin = await request("/api/auth/passkeys", { action: "begin", operation, purpose });
      const response = operation === "register"
        ? await startRegistration({ optionsJSON: begin.options })
        : await startAuthentication({ optionsJSON: begin.options });
      await request("/api/auth/passkeys", { action: "finish", challengeId: begin.challengeId, response });
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation was cancelled. Try again when you're ready.");
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="sm">
        <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand" />Confirm it&apos;s you</DialogTitle>
        <DialogDescription>
          {stage === "password"
            ? "Set up your first passkey. Confirm your password and, if enabled, your authenticator code once."
            : "Use Face ID, Touch ID, a security key or your device PIN. Your PIN and biometric details stay with your device. Confirmation lasts five minutes."}
        </DialogDescription>
        <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); void submit(); }}>
          {stage === "password" && <>
            <label className="block text-sm">Password
              <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-foreground" />
            </label>
            {mfa && <label className="block text-sm">Authenticator or backup code
              <input autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-foreground" />
            </label>}
          </>}
          {error && <p role="alert" className="text-sm text-foreground">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || stage === "loading" || (stage === "password" && (!password || (mfa && !code)))} iconLeft={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
              {stage === "password" ? "Confirm and continue" : stage === "register" ? "Create passkey" : stage === "loading" ? "Checking…" : "Confirm with passkey"}
            </Button>
          </div>
          <p className="text-xs text-muted">Use your personal account and device. If you lose access to every passkey, contact the owner for verified account recovery.</p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
