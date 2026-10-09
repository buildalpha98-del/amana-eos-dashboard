"use client";

/**
 * The door iPad (Round 4, 2026-10-09; mock-up "Door iPad Plan").
 *
 * Parent mode is the default and is locked: tap your child, choose who you
 * are, sign if the centre asks, done — and the screen resets itself so the
 * next family never sees the last one. Holding the top-right corner for two
 * seconds asks for a staff member's clock-in PIN and opens Service mode,
 * which falls back to Parent mode after two minutes untouched.
 *
 * Auth is the paired iPad's kiosk token (set up from the centre's Today
 * screen), not a staff session — Parent mode must keep working whoever is
 * or isn't signed in. Every rule is enforced again by /api/door/*.
 *
 * Family PINs come later (mass-emailed): the PIN step slots in between
 * "who are you" and the signature.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, Delete, LogIn, LogOut, Search, ShieldAlert } from "lucide-react";
import { SignaturePad } from "@/components/contracts/SignaturePad";
import { cn } from "@/lib/utils";

const TOKEN_KEY = "amana.kiosk.token";
const RESET_AFTER_DONE_MS = 5_000;
const FLOW_IDLE_MS = 60_000;
const SERVICE_IDLE_MS = 2 * 60_000;
const HOLD_TO_EXIT_MS = 2_000;

type DoorState = "arriving" | "here" | "gone" | "absent";
interface DoorChild {
  childId: string;
  sessionType: string;
  firstName: string;
  initial: string;
  photo: string | null;
  state: DoorState;
  needsEducator: boolean;
  family: string;
  adults: { key: "primary" | "secondary"; firstName: string; relationship: string | null }[];
}
interface DoorToday {
  service: { id: string; name: string };
  requireSignature: boolean;
  rooms: { sessionType: string; name: string }[];
  /** The session running now or next — where Parent mode opens. */
  currentSessionType: string | null;
  children: DoorChild[];
}

const DOT: Record<DoorState, string> = {
  arriving: "bg-orange-500",
  here: "bg-green-600",
  gone: "bg-blue-600",
  absent: "bg-red-600",
};

type Flow =
  | { step: "who"; child: DoorChild; action: "sign_in" | "sign_out"; with: string[] }
  | { step: "sign"; child: DoorChild; action: "sign_in" | "sign_out"; with: string[]; adult: DoorChild["adults"][number] }
  | { step: "done"; names: string; action: "sign_in" | "sign_out"; adultName: string }
  | { step: "educator"; childName: string }
  | null;

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function doorFetch<T>(token: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Something went wrong. Please see an educator.");
  return json as T;
}

export default function DoorPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [today, setToday] = useState<DoorToday | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"parent" | "unlock" | "service">("parent");
  const [staffName, setStaffName] = useState<string | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [flow, setFlow] = useState<Flow>(null);

  // SSR-safe: the pairing token only exists in this iPad's browser.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration read of localStorage
    setToken(readToken());
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setToday(await doorFetch<DoorToday>(token, "/api/door/today"));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Can't reach the centre right now.");
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch for the paired iPad
    void load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [token, load]);

  // Idle resets: a half-finished hand-over, and an unlocked Service mode.
  const lastTouch = useRef(0);
  useEffect(() => {
    const touch = () => (lastTouch.current = Date.now());
    touch();
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    const t = setInterval(() => {
      const idle = Date.now() - lastTouch.current;
      if (mode === "service" && idle > SERVICE_IDLE_MS) {
        setMode("parent");
        setStaffName(null);
      }
      if (mode === "unlock" && idle > FLOW_IDLE_MS) setMode("parent");
      if (flow && flow.step !== "done" && idle > FLOW_IDLE_MS) setFlow(null);
    }, 5_000);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      clearInterval(t);
    };
  }, [mode, flow]);

  const rooms = today?.rooms ?? [];
  const sessionType =
    room && rooms.some((r) => r.sessionType === room)
      ? room
      : (today?.currentSessionType ?? rooms[0]?.sessionType ?? null);
  const roomName = rooms.find((r) => r.sessionType === sessionType)?.name ?? "";
  const kids = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (today?.children ?? []).filter(
      (c) => c.sessionType === sessionType && (!q || c.firstName.toLowerCase().includes(q)),
    );
  }, [today, sessionType, search]);

  function startFor(child: DoorChild) {
    const name = child.firstName;
    if (child.needsEducator || child.adults.length === 0 || child.state === "gone" || child.state === "absent") {
      setFlow({ step: "educator", childName: name });
      return;
    }
    setFlow({ step: "who", child, action: child.state === "arriving" ? "sign_in" : "sign_out", with: [child.childId] });
  }

  // ── Unpaired ──────────────────────────────────────────────
  if (token === undefined) return <div className="min-h-dvh bg-parent-bg" />;
  if (!token) {
    return (
      <main className="grid min-h-dvh place-items-center bg-parent-bg p-6 text-center">
        <div className="max-w-md space-y-4">
          <Image src="/logo-icon-white.svg" alt="" width={56} height={56} className="mx-auto rounded-xl bg-brand p-2" />
          <h1 className="text-2xl font-heading font-semibold text-brand">This iPad isn&rsquo;t a door iPad yet</h1>
          <p className="text-foreground">
            The centre&rsquo;s Coordinator can set it up: sign in on this iPad, open the centre&rsquo;s Today screen and
            tap &ldquo;Set up as the door iPad&rdquo;.
          </p>
          <Link href="/login" className="inline-flex min-h-12 items-center rounded-xl bg-brand px-6 font-semibold text-white">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const parentFrame = mode === "parent";

  return (
    <main className="flex min-h-dvh flex-col bg-parent-bg text-foreground select-none">
      {/* Top bar — Jonquil in Parent mode, Midnight Green in Service mode. */}
      <header
        className={cn(
          "flex items-center justify-between gap-4 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]",
          parentFrame ? "bg-accent text-brand" : "bg-brand text-white",
        )}
      >
        <div className="min-w-0">
          <p className="truncate text-lg font-heading font-semibold">
            {parentFrame
              ? "Sign in & out"
              : mode === "unlock"
                ? "Staff only"
                : `Service mode${staffName ? ` · ${staffName}` : ""}`}
          </p>
          <p className="truncate text-sm opacity-80">{today?.service.name ?? ""}</p>
        </div>
        {parentFrame && <StaffCorner onHold={() => setMode("unlock")} />}
        {mode === "service" && (
          <button
            type="button"
            onClick={() => {
              setMode("parent");
              setStaffName(null);
            }}
            className="min-h-12 rounded-xl bg-accent px-5 font-semibold text-brand"
          >
            Back to Parent mode
          </button>
        )}
      </header>

      {mode === "unlock" && (
        <UnlockPad
          token={token}
          onCancel={() => setMode("parent")}
          onUnlocked={(name) => {
            setStaffName(name);
            setMode("service");
          }}
        />
      )}

      {mode === "service" && today && <ServiceMenu serviceId={today.service.id} />}

      {mode === "parent" && (
        <div className="flex flex-1 flex-col gap-4 p-5">
          {loadError && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{loadError}</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {rooms.length > 1 && (
              <div className="flex overflow-hidden rounded-xl border border-border bg-card">
                {rooms.map((r) => (
                  <button
                    key={r.sessionType}
                    type="button"
                    onClick={() => setRoom(r.sessionType)}
                    aria-pressed={sessionType === r.sessionType}
                    className={cn(
                      "min-h-12 px-5 text-base font-semibold",
                      sessionType === r.sessionType ? "bg-brand text-white" : "text-foreground",
                    )}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
            <label className="relative min-w-0 flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
              <input
                id="door-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find your child…"
                aria-label="Find your child"
                autoComplete="off"
                className="min-h-14 w-full rounded-xl border border-border bg-card pl-12 pr-4 text-lg"
              />
            </label>
          </div>

          {today && kids.length === 0 && (
            <p className="py-16 text-center text-lg text-muted">
              {rooms.length === 0 ? "No bookings today." : `No one called that in ${roomName} today.`}
            </p>
          )}

          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {kids.map((c) => (
              <li key={`${c.childId}:${c.sessionType}`}>
                <button
                  type="button"
                  onClick={() => startFor(c)}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 active:bg-surface"
                >
                  <span className="relative">
                    {c.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Blob-hosted child photo
                      <img src={c.photo} alt="" className="h-16 w-16 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-16 w-16 place-items-center rounded-full bg-brand text-lg font-bold text-white">
                        {c.firstName[0]}
                        {c.initial}
                      </span>
                    )}
                    <span
                      className={cn("absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full ring-[3px] ring-[var(--color-card)]", DOT[c.state])}
                      aria-hidden
                    />
                  </span>
                  <span className="text-base font-semibold">
                    {c.firstName} {c.initial}.
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {flow && today && (
        <FlowSheet
          token={token}
          flow={flow}
          setFlow={setFlow}
          today={today}
          onDone={load}
        />
      )}
    </main>
  );
}

/** Press-and-hold target in the top corner — staff only, deliberately quiet. */
function StaffCorner({ onHold }: { onHold: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    timer.current = setTimeout(onHold, HOLD_TO_EXIT_MS);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  return (
    <button
      type="button"
      aria-label="Staff: hold for two seconds to leave Parent mode"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
      className="h-12 w-12 shrink-0 rounded-xl border-2 border-dashed border-brand/30"
    />
  );
}

function PinPad({ value, onChange, length = 4 }: { value: string; onChange: (v: string) => void; length?: number }) {
  return (
    <div className="space-y-5">
      <div className="flex justify-center gap-4" aria-label={`${value.length} of ${length} digits`}>
        {Array.from({ length }).map((_, i) => (
          <span key={i} className={cn("h-5 w-5 rounded-full border-[3px] border-brand", i < value.length && "bg-brand")} />
        ))}
      </div>
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k) =>
          k === "" ? (
            <span key="blank" />
          ) : (
            <button
              key={k}
              type="button"
              aria-label={k === "del" ? "Delete" : k}
              onClick={() => onChange(k === "del" ? value.slice(0, -1) : (value + k).slice(0, length))}
              className="grid h-16 place-items-center rounded-2xl bg-card text-2xl font-semibold shadow-sm active:bg-surface"
            >
              {k === "del" ? <Delete className="h-6 w-6" /> : k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function UnlockPad({
  token,
  onCancel,
  onUnlocked,
}: {
  token: string;
  onCancel: () => void;
  onUnlocked: (name: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pin.length !== 4 || busy) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- submit once the 4th digit lands
    setBusy(true);
    doorFetch<{ name: string }>(token, "/api/door/unlock", { pin })
      .then((r) => onUnlocked(r.name))
      .catch((e: Error) => {
        setError(e.message);
        setPin("");
      })
      .finally(() => setBusy(false));
  }, [pin, busy, token, onUnlocked]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-heading font-semibold text-brand">Staff PIN</h1>
      <p className="text-muted">Your clock-in PIN</p>
      <PinPad value={pin} onChange={(v) => { setError(null); setPin(v); }} />
      <p className="min-h-6 text-red-700 dark:text-red-300" role="alert">{error}</p>
      <button type="button" onClick={onCancel} className="min-h-12 px-6 font-semibold text-brand underline underline-offset-4">
        Cancel
      </button>
    </div>
  );
}

function ServiceMenu({ serviceId }: { serviceId: string }) {
  const svc = `/services/${serviceId}`;
  const tiles = [
    { href: `${svc}?tab=daily&sub=roll-call`, label: "Sign in & out", note: "the full door list, with flags" },
    { href: "/kiosk", label: "Clock in / out", note: "staff" },
    { href: `${svc}?tab=compliance&sub=registers`, label: "Visitors", note: "sign a visitor in or out" },
    { href: `${svc}?tab=daily&sub=roster`, label: "Responsible Person", note: "who's in charge today" },
    { href: svc, label: "Centre dashboard", note: "Today and everything else" },
  ];
  return (
    <div className="grid flex-1 content-start gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((t) => (
        <Link key={t.label} href={t.href} className="flex min-h-28 flex-col justify-between rounded-2xl border border-border bg-card p-5 active:bg-surface">
          <span className="text-xl font-heading font-semibold text-brand">{t.label}</span>
          <span className="text-sm text-muted">{t.note}</span>
        </Link>
      ))}
      <p className="text-sm text-muted sm:col-span-2 lg:col-span-3">
        This goes back to Parent mode by itself after two minutes untouched.
      </p>
    </div>
  );
}

function FlowSheet({
  token,
  flow,
  setFlow,
  today,
  onDone,
}: {
  token: string;
  flow: NonNullable<Flow>;
  setFlow: (f: Flow) => void;
  today: DoorToday;
  onDone: () => void;
}) {
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Done and "see an educator" screens clear themselves.
  useEffect(() => {
    if (flow.step !== "done" && flow.step !== "educator") return;
    const t = setTimeout(() => setFlow(null), RESET_AFTER_DONE_MS);
    return () => clearTimeout(t);
  }, [flow, setFlow]);

  async function submit(adult: DoorChild["adults"][number], childIds: string[], sig: string | null) {
    if (flow.step !== "who" && flow.step !== "sign") return;
    setBusy(true);
    setError(null);
    try {
      const r = await doorFetch<{ name: string }>(token, "/api/door/sign", {
        sessionType: flow.child.sessionType,
        childIds,
        action: flow.action,
        adult: adult.key,
        ...(sig ? { signature: sig } : {}),
      });
      const names = today.children
        .filter((c) => childIds.includes(c.childId) && c.sessionType === flow.child.sessionType)
        .map((c) => c.firstName);
      setFlow({ step: "done", names: joinNames(names), action: flow.action, adultName: r.name.split(" ")[0] });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please see an educator.");
    } finally {
      setBusy(false);
    }
  }

  const close = () => setFlow(null);
  let body: React.ReactNode = null;

  if (flow.step === "educator") {
    body = (
      <div className="space-y-4 text-center">
        <ShieldAlert className="mx-auto h-14 w-14 text-brand" aria-hidden />
        <h2 className="text-3xl font-heading font-semibold text-brand">Please see an educator</h2>
        <p className="text-lg">They&rsquo;ll help you with {flow.childName}. It only takes a moment.</p>
      </div>
    );
  } else if (flow.step === "done") {
    body = (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-16 w-16 text-green-600" aria-hidden />
        <h2 className="text-3xl font-heading font-semibold text-brand">
          {flow.names} {flow.action === "sign_in" ? "signed in" : "signed out"}
        </h2>
        <p className="text-lg text-muted">
          {flow.action === "sign_in" ? `Thanks, ${flow.adultName}. Have a good day.` : `See you next time, ${flow.adultName}.`}
        </p>
      </div>
    );
  } else {
    const verb = flow.action === "sign_in" ? "dropping off" : "collecting";
    const kidName = flow.child.firstName;
    // Siblings at the same session in the same family, ready for the same action.
    const siblings = today.children.filter(
      (c) =>
        c.family === flow.child.family &&
        c.sessionType === flow.child.sessionType &&
        c.childId !== flow.child.childId &&
        !c.needsEducator &&
        c.state === flow.child.state,
    );
    const toggleSibling = (id: string) =>
      setFlow({ ...flow, with: flow.with.includes(id) ? flow.with.filter((x) => x !== id) : [...flow.with, id] });

    if (flow.step === "who") {
      body = (
        <div className="space-y-5">
          <h2 className="text-center text-3xl font-heading font-semibold text-brand">Who&rsquo;s {verb} {kidName}?</h2>
          <div className="grid gap-3">
            {flow.child.adults.map((a) => (
              <button
                key={a.key}
                type="button"
                disabled={busy}
                onClick={() =>
                  today.requireSignature
                    ? setFlow({ ...flow, step: "sign", adult: a })
                    : void submit(a, flow.with, null)
                }
                className="flex min-h-16 items-center justify-between rounded-2xl border-2 border-border bg-card px-5 text-xl font-semibold active:border-brand"
              >
                {a.firstName}
                {a.relationship && <span className="text-base font-normal text-muted">{a.relationship}</span>}
              </button>
            ))}
          </div>
          {siblings.length > 0 && (
            <div className="space-y-2">
              <p className="text-center text-muted">Also {flow.action === "sign_in" ? "signing in" : "signing out"}:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {siblings.map((s) => (
                  <button
                    key={s.childId}
                    type="button"
                    aria-pressed={flow.with.includes(s.childId)}
                    onClick={() => toggleSibling(s.childId)}
                    className={cn(
                      "min-h-12 rounded-full border-2 px-5 text-lg font-semibold",
                      flow.with.includes(s.childId) ? "border-brand bg-brand text-white" : "border-border bg-card",
                    )}
                  >
                    {s.firstName}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="text-center text-sm text-muted">
            Someone else {verb}? Please see an educator.
          </p>
        </div>
      );
    } else {
      body = (
        <div className="space-y-4">
          <h2 className="text-center text-3xl font-heading font-semibold text-brand">Sign here, {flow.adult.firstName}</h2>
          <div className="flex justify-center">
            <SignaturePad onChange={setSignature} width={520} height={200} disabled={busy} />
          </div>
          <button
            type="button"
            disabled={!signature || busy}
            onClick={() => void submit(flow.adult, flow.with, signature)}
            className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-xl font-semibold text-white disabled:opacity-50"
          >
            {flow.action === "sign_in" ? <LogIn className="h-6 w-6" /> : <LogOut className="h-6 w-6" />}
            {flow.action === "sign_in" ? "Sign in" : "Sign out"} {joinNames(
              today.children.filter((c) => flow.with.includes(c.childId) && c.sessionType === flow.child.sessionType).map((c) => c.firstName),
            )}
          </button>
        </div>
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-brand/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl space-y-4 rounded-3xl bg-parent-bg p-6 shadow-2xl sm:p-8">
        {body}
        {error && <p className="text-center text-lg text-red-700 dark:text-red-300" role="alert">{error}</p>}
        {(flow.step === "who" || flow.step === "sign") && (
          <button type="button" onClick={close} className="mx-auto block min-h-12 px-6 text-lg font-semibold text-brand underline underline-offset-4">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
