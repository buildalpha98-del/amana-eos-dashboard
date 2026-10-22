"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { ConfirmIdentityDialog } from "@/components/security/BankRevealDialog";
import { SERVICE_TZ } from "@/lib/timezone";

type Key = { id: string; label: string; createdAt: string; lastUsedAt: string | null };
type Action = { type: "add" } | { type: "codes" } | { type: "remove"; id: string };
export function PasskeySettings() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [label, setLabel] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [recovery, setRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const request = async (url: string, method = "GET", data?: unknown) => {
    const res = await fetch(url, { method, cache: "no-store", headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Couldn't update bank security. Please try again.");
    return body;
  };
  const refresh = async () => setKeys(await request("/api/auth/passkeys"));
  useEffect(() => {
    let current = true;
    void fetch("/api/auth/passkeys", { cache: "no-store" }).then(async res => {
      if (!res.ok) throw new Error("Couldn't load your passkeys. Reload this page to try again.");
      const data = await res.json(); if (current) setKeys(data);
    }).catch(err => { if (current) setError(err.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  // Recovery codes stay in memory only and disappear when the page is hidden.
  useEffect(() => {
    const clear = () => { if (document.hidden) { setCodes([]); setPassword(""); setMfaCode(""); setRecoveryCode(""); } };
    document.addEventListener("visibilitychange", clear);
    return () => document.removeEventListener("visibilitychange", clear);
  }, []);
  const complete = async () => {
    const next = action; setAction(null); setBusy(true); setError("");
    try {
      if (next?.type === "remove") await request("/api/auth/passkeys", "DELETE", { id: next.id });
      if (next?.type === "codes") setCodes((await request("/api/auth/passkeys/recovery", "POST", { action: "generate" })).codes);
      await refresh(); setLabel("");
    } catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
    finally { setBusy(false); }
  };
  const recover = async () => {
    setBusy(true); setError("");
    try {
      await request("/api/auth/passkeys/recovery", "POST", { action: "recover", password, mfaCode: mfaCode || undefined, recoveryCode });
      setPassword(""); setMfaCode(""); setRecoveryCode("");
      await signOut({ callbackUrl: "/login" });
    } catch (err) { setError(err instanceof Error ? err.message : "Recovery failed. Please try again."); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-border bg-card p-4 sm:p-6 space-y-4" aria-labelledby="bank-security-title">
    <div><h2 id="bank-security-title" className="font-heading text-lg font-semibold text-foreground">Bank security</h2>
      <p className="mt-1 text-sm text-muted">Passkeys confirm it’s you before opening or changing family bank details. Keep a second device or security key as a backup.</p></div>
    {error && <p role="alert" className="text-sm text-foreground">{error}</p>}
    {loading ? <p className="text-sm text-muted">Loading your passkeys…</p> : <ul className="space-y-3">{keys.map(key => <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
      <div className="min-w-0"><p className="font-medium text-foreground break-words">{key.label || "Passkey"}</p><p className="text-xs text-muted">Added {new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: SERVICE_TZ }).format(new Date(key.createdAt))} · {key.id.slice(-6)}</p></div>
      <Button variant="outline" disabled={busy || keys.length < 2} onClick={() => { setError(""); setAction({ type: "remove", id: key.id }); }}>Remove</Button>
    </li>)}</ul>}
    <label className="block text-sm text-foreground">Device name
      <input value={label} maxLength={60} placeholder="e.g. Work phone or backup key" onChange={e => setLabel(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3" /></label>
    <Button disabled={busy || loading || !label.trim()} onClick={() => { setError(""); setAction({ type: "add" }); }}>{keys.length ? "Add another passkey" : "Set up a passkey"}</Button>
    <div className="border-t border-border pt-4 space-y-3"><h3 className="font-semibold text-foreground">If you lose your devices</h3>
      <p className="text-sm text-muted">Save recovery codes somewhere private, separate from your devices. Creating new codes replaces all previous codes. Recovery needs your password and one saved code, plus your authenticator code if enabled. It removes all passkeys and signs you out everywhere.</p>
      <Button variant="outline" disabled={busy || !keys.length} onClick={() => { setCodes([]); setError(""); setAction({ type: "codes" }); }}>Create new recovery codes</Button>
      {codes.length > 0 && <div className="rounded-lg border border-border bg-surface p-3 space-y-3"><p className="text-sm font-medium">Shown once. Save these codes privately before closing this page.</p><pre className="text-xs whitespace-pre-wrap break-all select-all">{codes.join("\n")}</pre><Button variant="outline" onClick={() => setCodes([])}>I’ve saved my codes — hide them</Button></div>}
      <Button variant="ghost" disabled={busy} onClick={() => { setRecovery(!recovery); setPassword(""); setMfaCode(""); setRecoveryCode(""); }}>I’ve lost all my passkeys</Button>
      {recovery && <form className="space-y-3" onSubmit={e => { e.preventDefault(); void recover(); }}>
        <label className="block text-sm">Password<input autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3" /></label>
        <label className="block text-sm">Authenticator or backup code (if enabled)<input autoComplete="one-time-code" value={mfaCode} onChange={e => setMfaCode(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3" /></label>
        <label className="block text-sm">Saved passkey recovery code<input autoComplete="off" type="password" value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3" /></label>
        <p className="text-sm text-muted">After signing in again, set up a replacement passkey before viewing bank details. Without a saved code, contact the owner for verified account recovery.</p>
        <Button type="submit" variant="destructive" disabled={busy || !password || !recoveryCode}>Reset passkeys and sign out everywhere</Button>
      </form>}
    </div>
    <ConfirmIdentityDialog open={!!action} mfa={false} purpose="passkey_setup" enrolNew={action?.type === "add"} label={label.trim() || "Passkey"} onClose={() => setAction(null)} onConfirmed={() => { void complete(); }} />
  </section>;
}
