"use client";

/**
 * The centre's rooms — what they're called, when they run, what they cost.
 *
 * The three session KEYS (bsc/asc/vc) are fixed: they're written into
 * every booking, attendance record and fortnight pattern in the system,
 * and renaming them would be a migration rather than a setting. What a
 * centre calls them is not fixed — nobody at Amana says "BSC", they say
 * "Rise and Shine" — so the label, the hours and the prices are all
 * per-service.
 *
 * Fees are a LIST per room rather than one number, because a room has
 * more than one price: the full session and the short session are the
 * same room at different hours. Each tier carries its own window.
 */

import { useState } from "react";
import { Clock, Edit3, Plus, Trash2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { toast } from "@/hooks/useToast";
import { useUpdateService } from "@/hooks/useServices";
import {
  activeSessionKeys,
  CORE_SESSION_KEYS,
  DEFAULT_ROOMS,
  EXTRA_SESSION_KEYS,
  SESSION_KEYS,
  formatTime,
  roomLabel,
  type FeeTier,
  type SessionKey,
  type SessionTimes,
} from "@/lib/service-settings";
import { formatCents, parseDollarsToCents } from "@/lib/family-billing";
import { analyseRoomConfiguration } from "@/lib/room-configuration";
import { RoomDetailPanel } from "./RoomDetailPanel";

interface EditableRoom {
  label: string;
  start: string;
  end: string;
  capacity: string;
  ratio: string;
  fees: Array<{ id: string; name: string; start: string; end: string; amount: string }>;
}

type EditableRooms = Record<SessionKey, EditableRoom>;

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

function toEditable(value: SessionTimes | null | undefined): EditableRooms {
  const out = {} as EditableRooms;
  for (const key of SESSION_KEYS) {
    const room = value?.[key];
    out[key] = {
      label: room?.label ?? "",
      start: room?.start ?? "",
      end: room?.end ?? "",
      capacity: room?.capacity != null ? String(room.capacity) : "",
      ratio: room?.ratio ?? "",
      fees: (room?.fees ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        start: f.start ?? "",
        end: f.end ?? "",
        amount: (f.amountCents / 100).toFixed(2),
      })),
    };
  }
  return out;
}

/**
 * Ids come from the row's position and a counter rather than a random
 * source, so the same edit produces the same payload and a re-render
 * can't quietly reassign a tier's identity mid-typing.
 */
/**
 * The in-progress rooms as a SessionTimes, so the advisor sees what's on
 * screen rather than what was last saved. Only labels matter to it —
 * that's how it knows which extra slots are real rooms.
 */
function draftSessionTimes(rooms: EditableRooms): SessionTimes {
  const out: SessionTimes = {};
  for (const key of SESSION_KEYS) {
    const r = rooms[key];
    if (!r.start.trim() || !r.end.trim()) continue;
    out[key] = {
      start: r.start.trim(),
      end: r.end.trim(),
      ...(r.label.trim() ? { label: r.label.trim() } : {}),
    };
  }
  return out;
}

function nextFeeId(existing: EditableRoom["fees"]): string {
  let n = existing.length + 1;
  const taken = new Set(existing.map((f) => f.id));
  while (taken.has(`fee-${n}`)) n += 1;
  return `fee-${n}`;
}

export function RoomsAndFeesCard({
  service,
  canEdit,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any;
  canEdit: boolean;
}) {
  const updateService = useUpdateService();
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<EditableRooms>(() =>
    toEditable(service.sessionTimes as SessionTimes | null),
  );
  const [openRoom, setOpenRoom] = useState<SessionKey | null>(null);

  const saved = (service.sessionTimes ?? null) as SessionTimes | null;
  const saving = updateService.isPending;

  function update(key: SessionKey, patch: Partial<EditableRoom>) {
    setRooms((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  // The federal OSHC minimum, unless this service carries its own.
  const defaultRatio =
    typeof service.ratioSettings?.default?.ratio === "string"
      ? service.ratioSettings.default.ratio
      : "1:15";

  // Advice recomputes as the numbers are typed, so a capacity that
  // breaches approved places is caught before Save, not after.
  const advisories = analyseRoomConfiguration({
    sessionTimes: draftSessionTimes(rooms),
    approvedPlaces: service.capacity ?? null,
    capacities: Object.fromEntries(
      SESSION_KEYS.map((k) => [
        k,
        rooms[k].capacity.trim() === "" ? null : Number(rooms[k].capacity),
      ]),
    ),
    ratios: Object.fromEntries(
      SESSION_KEYS.map((k) => [k, rooms[k].ratio.trim() || null]),
    ),
    defaultRatio,
  });

  function buildPayload(): SessionTimes | null {
    const out: SessionTimes = {};
    for (const key of SESSION_KEYS) {
      const r = rooms[key];
      const start = r.start.trim();
      const end = r.end.trim();
      // A room without hours isn't configured — carrying its label alone
      // would put a named room on the booking form with no session.
      if (!start || !end) continue;

      const fees: FeeTier[] = [];
      for (const f of r.fees) {
        const name = f.name.trim();
        if (!name) continue;
        const cents = parseDollarsToCents(f.amount);
        if (cents === undefined) {
          throw new Error(
            `"${name}" needs a dollar amount, e.g. 28 or 28.50.`,
          );
        }
        fees.push({
          id: f.id,
          name,
          amountCents: cents ?? 0,
          ...(f.start.trim() ? { start: f.start.trim() } : {}),
          ...(f.end.trim() ? { end: f.end.trim() } : {}),
        });
      }

      const capacity = r.capacity.trim();
      const ratio = r.ratio.trim();
      if (ratio && !/^\d+:\d+$/.test(ratio)) {
        throw new Error(
          `Ratio for ${r.label.trim() || key} looks like 1:15, not "${ratio}".`,
        );
      }

      out[key] = {
        start,
        end,
        ...(r.label.trim() ? { label: r.label.trim() } : {}),
        ...(capacity !== "" && Number.isFinite(Number(capacity))
          ? { capacity: Number(capacity) }
          : {}),
        ...(ratio ? { ratio } : {}),
        ...(fees.length > 0 ? { fees } : {}),
      };
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  async function handleSave() {
    let payload: SessionTimes | null;
    try {
      payload = buildPayload();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Check the fees.",
      });
      return;
    }
    try {
      await updateService.mutateAsync({ id: service.id, sessionTimes: payload });
      toast({ description: "Rooms and fees updated." });
      setOpen(false);
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Couldn't save.",
      });
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Rooms &amp; fees</h3>
          <p className="text-xs text-muted mt-0.5">
            What each room is called here, when it runs, and what it costs.
          Name an extra room to add another booking type.
          </p>
        </div>
        {canEdit && (
          <Button
            variant="outline"
            onClick={() => {
              setRooms(toEditable(service.sessionTimes as SessionTimes | null));
              setOpen(true);
            }}
          >
            <Edit3 className="w-4 h-4" />
            Edit
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {/* Only rooms this centre actually uses. An unnamed spare slot
            isn't a room yet — it's an empty field waiting in the editor. */}
        {activeSessionKeys(saved).map((key) => {
          const room = saved?.[key];
          const configured = Boolean(room?.start && room?.end);
          return (
            <div
              key={key}
              className="rounded-lg border border-border p-3.5"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {/* Opens the room's own view — details, fees, block-outs
                    and who's in it, without leaving this page. */}
                <button
                  type="button"
                  onClick={() => setOpenRoom(key)}
                  className="text-sm font-medium text-foreground underline decoration-transparent underline-offset-2 hover:decoration-current"
                >
                  {roomLabel(saved, key)}
                </button>
                <p className="text-xs text-muted flex items-center gap-1.5">
                  {room?.capacity != null && room.capacity > 0 && (
                    <span className="mr-1">
                      {room.capacity} places
                      {room.ratio ? ` at ${room.ratio}` : ""} ·
                    </span>
                  )}
                  <Clock className="w-3.5 h-3.5" />
                  {configured ? (
                    `${formatTime(room!.start)} – ${formatTime(room!.end)}`
                  ) : (
                    <span className="text-amber-700 dark:text-amber-300">
                      Not set — defaults to{" "}
                      {formatTime(DEFAULT_ROOMS[key].start)} –{" "}
                      {formatTime(DEFAULT_ROOMS[key].end)}
                    </span>
                  )}
                </p>
              </div>

              {room?.fees && room.fees.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {room.fees.map((f) => (
                    <li
                      key={f.id}
                      className="text-xs text-muted flex items-center gap-2"
                    >
                      <DollarSign className="w-3 h-3 shrink-0" />
                      <span className="text-foreground">{f.name}</span>
                      {f.start && f.end && (
                        <span>
                          {formatTime(f.start)} – {formatTime(f.end)}
                        </span>
                      )}
                      <span className="ml-auto text-foreground font-medium">
                        {formatCents(f.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted">No fees set.</p>
              )}
            </div>
          );
        })}
      </div>

      <RoomDetailPanel
        serviceId={service.id}
        sessionKey={openRoom}
        sessionTimes={saved}
        approvedPlaces={service.capacity ?? null}
        open={openRoom !== null}
        onClose={() => setOpenRoom(null)}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Rooms &amp; fees</DialogTitle>

          {advisories.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                Check the room setup
              </p>
              <ul className="mt-1 space-y-1">
                {advisories.map((a, i) => (
                  <li
                    key={`${a.key ?? "service"}-${i}`}
                    className="text-xs text-amber-900 dark:text-amber-100"
                  >
                    {a.roomName && <strong>{a.roomName}: </strong>}
                    {a.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 space-y-6 max-h-[65vh] overflow-y-auto pr-1">
            {CORE_SESSION_KEYS.map((key) => {
              const r = rooms[key];
              return (
                <div key={key} className="rounded-lg border border-border p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-3">
                      <label
                        htmlFor={`rm-${key}-label`}
                        className="block text-sm font-medium text-foreground mb-1"
                      >
                        Room name
                      </label>
                      <input
                        id={`rm-${key}-label`}
                        className={field}
                        value={r.label}
                        placeholder={DEFAULT_ROOMS[key].label}
                        onChange={(e) => update(key, { label: e.target.value })}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`rm-${key}-start`}
                        className="block text-sm font-medium text-foreground mb-1"
                      >
                        Starts
                      </label>
                      <input
                        id={`rm-${key}-start`}
                        type="time"
                        className={field}
                        value={r.start}
                        onChange={(e) => update(key, { start: e.target.value })}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`rm-${key}-end`}
                        className="block text-sm font-medium text-foreground mb-1"
                      >
                        Ends
                      </label>
                      <input
                        id={`rm-${key}-end`}
                        type="time"
                        className={field}
                        value={r.end}
                        onChange={(e) => update(key, { end: e.target.value })}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`rm-${key}-capacity`}
                        className="block text-sm font-medium text-foreground mb-1"
                      >
                        Places
                      </label>
                      <input
                        id={`rm-${key}-capacity`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        className={field}
                        value={r.capacity}
                        placeholder="e.g. 45"
                        onChange={(e) => update(key, { capacity: e.target.value })}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`rm-${key}-ratio`}
                        className="block text-sm font-medium text-foreground mb-1"
                      >
                        Ratio{" "}
                        <span className="font-normal text-muted">
                          (optional)
                        </span>
                      </label>
                      <input
                        id={`rm-${key}-ratio`}
                        className={field}
                        value={r.ratio}
                        placeholder={defaultRatio}
                        onChange={(e) => update(key, { ratio: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">
                        Fees
                      </span>
                      <Button
                        variant="outline"
                        onClick={() =>
                          update(key, {
                            fees: [
                              ...r.fees,
                              {
                                id: nextFeeId(r.fees),
                                name: "",
                                start: "",
                                end: "",
                                amount: "",
                              },
                            ],
                          })
                        }
                      >
                        <Plus className="w-4 h-4" />
                        Add fee
                      </Button>
                    </div>

                    {r.fees.length === 0 ? (
                      <p className="text-xs text-muted">
                        None yet. Add one per price — a full session and a
                        short session are two fees on the same room.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {r.fees.map((f, i) => (
                          <div
                            key={f.id}
                            className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end"
                          >
                            <div className="col-span-2 sm:col-span-4">
                              <label
                                htmlFor={`fee-${key}-${f.id}-name`}
                                className="block text-xs text-muted mb-1"
                              >
                                Name
                              </label>
                              <input
                                id={`fee-${key}-${f.id}-name`}
                                className={field}
                                value={f.name}
                                placeholder="Full session"
                                onChange={(e) => {
                                  const fees = [...r.fees];
                                  fees[i] = { ...f, name: e.target.value };
                                  update(key, { fees });
                                }}
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label
                                htmlFor={`fee-${key}-${f.id}-start`}
                                className="block text-xs text-muted mb-1"
                              >
                                From
                              </label>
                              <input
                                id={`fee-${key}-${f.id}-start`}
                                type="time"
                                className={field}
                                value={f.start}
                                onChange={(e) => {
                                  const fees = [...r.fees];
                                  fees[i] = { ...f, start: e.target.value };
                                  update(key, { fees });
                                }}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label
                                htmlFor={`fee-${key}-${f.id}-end`}
                                className="block text-xs text-muted mb-1"
                              >
                                To
                              </label>
                              <input
                                id={`fee-${key}-${f.id}-end`}
                                type="time"
                                className={field}
                                value={f.end}
                                onChange={(e) => {
                                  const fees = [...r.fees];
                                  fees[i] = { ...f, end: e.target.value };
                                  update(key, { fees });
                                }}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label
                                htmlFor={`fee-${key}-${f.id}-amt`}
                                className="block text-xs text-muted mb-1"
                              >
                                Fee
                              </label>
                              <input
                                id={`fee-${key}-${f.id}-amt`}
                                className={field}
                                inputMode="decimal"
                                value={f.amount}
                                placeholder="28.00"
                                onChange={(e) => {
                                  const fees = [...r.fees];
                                  fees[i] = { ...f, amount: e.target.value };
                                  update(key, { fees });
                                }}
                              />
                            </div>
                            <div className="sm:col-span-1 flex justify-end">
                              <button
                                type="button"
                                aria-label={`Remove ${f.name || "fee"}`}
                                onClick={() =>
                                  update(key, {
                                    fees: r.fees.filter((x) => x.id !== f.id),
                                  })
                                }
                                className="p-2.5 rounded-lg text-muted hover:text-red-600 hover:bg-surface transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* ── Extra booking types ─────────────────────────────
                Four spare slots. Give one a name and it becomes a real
                booking type everywhere: the casual settings, the parent
                booking calendar, the roll. Leave it blank and it stays
                invisible — an unconfigured room on a booking form is
                worse than no option at all.

                The CODE behind each slot is fixed forever (it's written
                into every booking and attendance record); only the name
                is yours to change. */}
            <div className="rounded-lg border border-dashed border-border p-4 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Extra booking types
                </h4>
                <p className="text-xs text-muted mt-0.5">
                  Name one to add another programme — a homework club, an
                  early-finish session. Clear the name to retire it (existing
                  bookings keep their history).
                </p>
              </div>

              {EXTRA_SESSION_KEYS.map((key) => {
                const r = rooms[key];
                return (
                  <div
                    key={key}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                  >
                    <div className="sm:col-span-3">
                      <label
                        htmlFor={`rm-${key}-label`}
                        className="block text-sm font-medium text-foreground mb-1"
                      >
                        Name
                      </label>
                      <input
                        id={`rm-${key}-label`}
                        className={field}
                        value={r.label}
                        placeholder="e.g. Homework Club — leave blank if unused"
                        onChange={(e) => update(key, { label: e.target.value })}
                      />
                    </div>
                    {r.label.trim() && (
                      <>
                        <div>
                          <label
                            htmlFor={`rm-${key}-start`}
                            className="block text-sm font-medium text-foreground mb-1"
                          >
                            Starts
                          </label>
                          <input
                            id={`rm-${key}-start`}
                            type="time"
                            className={field}
                            value={r.start}
                            onChange={(e) =>
                              update(key, { start: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`rm-${key}-end`}
                            className="block text-sm font-medium text-foreground mb-1"
                          >
                            Ends
                          </label>
                          <input
                            id={`rm-${key}-end`}
                            type="time"
                            className={field}
                            value={r.end}
                            onChange={(e) => update(key, { end: e.target.value })}
                          />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
