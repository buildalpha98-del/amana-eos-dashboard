"use client";

/**
 * /kiosk — paired-tablet timeclock surface.
 *
 * Lives outside the (dashboard) auth layout: no session required.
 * The tablet authenticates with a long bearer token issued during
 * the admin register flow (Settings → Kiosks → Register), stored
 * in `localStorage`. Staff at the centre walk up, tap their face,
 * enter their 4-digit PIN.
 *
 * State machine:
 *   1. **Unpaired** — no token in localStorage → paste-token form
 *   2. **Paired, idle** — staff grid (auto-polls /api/kiosk/staff)
 *   3. **PIN entry** — staff tapped a face → 4-digit PIN pad
 *   4. **Result toast** — success / error message → auto-return to grid
 *      after 3s
 *
 * 2026-05-04: timeclock v1 sub-PR (followup to PR #62).
 */

import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw, X, Check, AlertCircle } from "lucide-react";

// ── localStorage helpers ──────────────────────────────────────────

const TOKEN_KEY = "amana.kiosk.token";
const LABEL_KEY = "amana.kiosk.label";

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function writeToken(token: string, label: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(LABEL_KEY, label);
}

function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(LABEL_KEY);
}

// ── Types ─────────────────────────────────────────────────────────

interface StaffRow {
  id: string;
  name: string;
  avatar: string | null;
}

type ClockResult =
  | { status: "ok"; message: string }
  | { status: "error"; message: string }
  | null;

// ── Page ──────────────────────────────────────────────────────────

export default function KioskPage() {
  const [token, setToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setToken(readToken());
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <KioskShell>
        <div className="flex items-center justify-center h-full text-muted">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </KioskShell>
    );
  }

  if (!token) {
    return (
      <KioskShell>
        <PairingForm
          onPaired={(t, label) => {
            writeToken(t, label);
            setToken(t);
          }}
        />
      </KioskShell>
    );
  }

  return (
    <KioskShell>
      <KioskMain
        token={token}
        onUnpair={() => {
          clearToken();
          setToken(null);
        }}
      />
    </KioskShell>
  );
}

// Outer chrome — full-screen, no app sidebar (this page lives outside
// the (dashboard) layout). Brand-cream background; large tap targets.
function KioskShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[color:var(--color-cream-deep,#fff8ee)] flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between border-b border-border bg-card">
        <div className="text-sm font-semibold text-foreground">
          Amana OSHC · Time clock
        </div>
        <div className="text-xs text-muted">
          {typeof window !== "undefined"
            ? window.localStorage.getItem(LABEL_KEY) ?? ""
            : ""}
        </div>
      </header>
      <main className="flex-1 p-6 sm:p-10">{children}</main>
    </div>
  );
}

// ── Pairing form ──────────────────────────────────────────────────

function PairingForm({
  onPaired,
}: {
  onPaired: (token: string, label: string) => void;
}) {
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  async function submit() {
    setError(null);
    if (!token.trim() || !label.trim()) {
      setError("Both fields are required.");
      return;
    }
    setValidating(true);
    try {
      // Quick sanity-call to /api/kiosk/staff — confirms the token
      // matches a non-revoked Kiosk before we persist it. Cheap to
      // verify and saves the user from saving a typo.
      const res = await fetch("/api/kiosk/staff", {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      if (!res.ok) {
        setError(
          "That token isn't recognised. Double-check the value or ask the admin to register again.",
        );
        return;
      }
      onPaired(token.trim(), label.trim());
    } catch {
      setError("Couldn't reach the server. Check the tablet's connection.");
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="max-w-md mx-auto bg-card rounded-2xl border border-border p-6 shadow-sm">
      <h1 className="text-xl font-semibold mb-1">Pair this tablet</h1>
      <p className="text-sm text-muted mb-4">
        An admin generates a kiosk token in Settings → Kiosks → Register.
        Paste the token here once and this device is set.
      </p>
      <div className="space-y-3">
        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
            Kiosk token
          </span>
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            rows={3}
            placeholder="Paste the bearer token from Settings → Kiosks"
            className="w-full rounded-lg border border-border px-3 py-2 text-xs bg-card font-mono"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
            Tablet label
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Front desk iPad"
            className="w-full rounded-lg border border-border px-3 py-2.5 text-sm bg-card min-h-[44px]"
          />
        </label>
        {error && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={validating}
          className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-lg bg-brand text-white font-medium text-sm disabled:opacity-60"
        >
          {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Pair tablet
        </button>
      </div>
    </div>
  );
}

// ── Main UI (post-pair) ───────────────────────────────────────────

function KioskMain({
  token,
  onUnpair,
}: {
  token: string;
  onUnpair: () => void;
}) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateError, setStateError] = useState<string | null>(null);
  const [picked, setPicked] = useState<StaffRow | null>(null);
  const [result, setResult] = useState<ClockResult>(null);

  const fetchStaff = useCallback(async () => {
    setStateError(null);
    try {
      const res = await fetch("/api/kiosk/staff", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        // Token revoked or invalid — kick back to pairing.
        onUnpair();
        return;
      }
      if (!res.ok) throw new Error("staff fetch failed");
      const data = (await res.json()) as { staff: StaffRow[] };
      setStaff(data.staff);
    } catch {
      setStateError("Couldn't load staff list. Retrying in a minute…");
    } finally {
      setLoading(false);
    }
  }, [token, onUnpair]);

  useEffect(() => {
    void fetchStaff();
    const t = setInterval(() => {
      void fetchStaff();
    }, 60_000);
    return () => clearInterval(t);
  }, [fetchStaff]);

  // Auto-clear the result toast after 3s so the next staff member
  // doesn't see the previous person's confirmation.
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 3000);
    return () => clearTimeout(t);
  }, [result]);

  if (picked) {
    return (
      <PinPadForUser
        token={token}
        staff={picked}
        onCancel={() => setPicked(null)}
        onResult={(r) => {
          setPicked(null);
          setResult(r);
        }}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {result && (
        <div
          role="status"
          aria-live="polite"
          className={
            result.status === "ok"
              ? "mb-4 rounded-lg bg-green-100 border border-green-300 text-green-900 px-4 py-3 flex items-center gap-2"
              : "mb-4 rounded-lg bg-rose-100 border border-rose-300 text-rose-900 px-4 py-3 flex items-center gap-2"
          }
        >
          {result.status === "ok" ? (
            <Check className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span className="font-medium">{result.message}</span>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Tap your name to clock in / out</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchStaff()}
            className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={onUnpair}
            className="text-xs text-muted hover:text-foreground"
          >
            Unpair
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : stateError ? (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
          {stateError}
        </div>
      ) : staff.length === 0 ? (
        <p className="text-sm text-muted">
          No staff at this service have set a PIN yet. Each staff member
          sets theirs from My Portal → Kiosk PIN.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {staff.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setPicked(s)}
              className="flex flex-col items-center gap-2 rounded-2xl bg-card border border-border p-4 hover:border-brand active:scale-[0.98] transition-all"
            >
              <div className="w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center overflow-hidden">
                {s.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.avatar}
                    alt={s.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xl font-semibold text-brand">
                    {s.name
                      .split(" ")
                      .map((p) => p[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </span>
                )}
              </div>
              <span className="text-sm font-medium text-foreground text-center">
                {s.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PIN pad ──────────────────────────────────────────────────────

function PinPadForUser({
  token,
  staff,
  onCancel,
  onResult,
}: {
  token: string;
  staff: StaffRow;
  onCancel: () => void;
  onResult: (r: ClockResult) => void;
}) {
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (action: "in" | "out") => {
      if (pin.length !== 4) {
        setError("Enter your 4-digit PIN.");
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/kiosk/clock", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userId: staff.id, pin, action }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(
            (data as { error?: string }).error ?? "Couldn't clock you in.",
          );
          return;
        }
        const verb = action === "in" ? "Clocked in" : "Clocked out";
        onResult({
          status: "ok",
          message: `${verb}: ${staff.name}`,
        });
      } catch {
        setError("Network error — try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [pin, staff, token, onResult],
  );

  return (
    <div className="max-w-sm mx-auto bg-card rounded-2xl border border-border p-6 shadow-sm space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{staff.name}</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted hover:text-foreground"
          aria-label="Cancel"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="flex justify-center gap-2 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className={
              "w-10 h-12 rounded-lg border flex items-center justify-center text-xl font-mono " +
              (i < pin.length
                ? "bg-brand/10 border-brand text-brand"
                : "bg-surface border-border text-muted")
            }
          >
            {i < pin.length ? "•" : ""}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <PinKey key={n} onClick={() => setPin((p) => (p.length < 4 ? p + String(n) : p))}>
            {n}
          </PinKey>
        ))}
        <PinKey
          onClick={() =>
            setPin((p) => (p.length === 0 ? "" : p.slice(0, -1)))
          }
        >
          ⌫
        </PinKey>
        <PinKey onClick={() => setPin((p) => (p.length < 4 ? p + "0" : p))}>
          0
        </PinKey>
        <PinKey onClick={() => setPin("")}>Clear</PinKey>
      </div>

      {error && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit("in")}
          disabled={submitting || pin.length !== 4}
          className="flex-1 min-h-[48px] rounded-lg bg-green-600 text-white font-medium disabled:opacity-50"
        >
          {submitting ? "…" : "Clock in"}
        </button>
        <button
          type="button"
          onClick={() => void submit("out")}
          disabled={submitting || pin.length !== 4}
          className="flex-1 min-h-[48px] rounded-lg bg-rose-600 text-white font-medium disabled:opacity-50"
        >
          {submitting ? "…" : "Clock out"}
        </button>
      </div>
    </div>
  );
}

function PinKey({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[56px] rounded-lg bg-surface border border-border text-lg font-medium hover:bg-card active:scale-[0.97] transition-all"
    >
      {children}
    </button>
  );
}
