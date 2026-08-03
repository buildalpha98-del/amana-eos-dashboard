"use client";

/**
 * "Add Amana to your phone" — the one piece of setup that actually
 * matters to a family. Everything else in the old getting-started
 * checklist was work we could do for them.
 *
 * Shows BOTH sets of instructions rather than sniffing the browser. A
 * parent on a shared laptop, a work phone, or a browser we guessed wrong
 * about is otherwise left with steps that don't match anything on their
 * screen and no way to see the others.
 *
 * Dismissal is stored against the ACCOUNT, so it doesn't come back on
 * their other device.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Smartphone, ChevronDown, X, Loader2 } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

const IOS_STEPS = [
  "Open the portal in Safari",
  "Tap the Share button at the bottom of the screen",
  'Scroll down and tap "Add to Home Screen"',
  'Tap "Add"',
];

const ANDROID_STEPS = [
  "Open the portal in Chrome",
  "Tap the three-dot menu, top right",
  'Tap "Add to Home screen" (or "Install app")',
  'Tap "Install"',
];

export function AddToPhoneCard() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<{ appInstallCardDismissed: boolean }>({
    queryKey: ["parent", "preferences"],
    queryFn: () => fetchApi("/api/parent/preferences"),
    retry: 1,
  });

  const dismiss = useMutation({
    mutationFn: () =>
      mutateApi("/api/parent/preferences", {
        method: "POST",
        body: { appInstallCardDismissed: true },
      }),
    onSuccess: () => {
      qc.setQueryData(["parent", "preferences"], {
        appInstallCardDismissed: true,
      });
    },
  });

  // Nothing while we're finding out — flashing the card up and pulling it
  // away is worse than a moment of blank space.
  if (isLoading || data?.appInstallCardDismissed) return null;

  return (
    <section
      aria-label="Add Amana to your phone"
      className="warm-card border border-[color:var(--color-border)]"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 text-left min-h-11"
      >
        <div className="w-10 h-10 rounded-full bg-[color:var(--color-brand-soft)] flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5 text-[color:var(--color-brand)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[color:var(--color-foreground)]">
            Add Amana to your phone
          </p>
          <p className="text-xs text-[color:var(--color-muted)]">
            Opens like an app — no App Store needed
          </p>
        </div>
        <ChevronDown
          className={
            "w-4 h-4 text-[color:var(--color-muted)] shrink-0 transition-transform " +
            (open ? "rotate-180" : "")
          }
        />
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t border-[color:var(--color-border)] space-y-5">
          <Instructions title="iPhone or iPad (Safari)" steps={IOS_STEPS} />
          <Instructions title="Android (Chrome)" steps={ANDROID_STEPS} />

          <button
            onClick={() => dismiss.mutate()}
            disabled={dismiss.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[color:var(--color-border)] text-sm font-medium text-[color:var(--color-muted)] min-h-11 disabled:opacity-50"
          >
            {dismiss.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <X className="w-4 h-4" />
            )}
            Done — hide this
          </button>
        </div>
      )}
    </section>
  );
}

function Instructions({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)] mb-2">
        {title}
      </p>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-3 text-sm">
            <span className="w-5 h-5 rounded-full bg-[color:var(--color-surface)] text-[color:var(--color-foreground)] text-2xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span className="text-[color:var(--color-foreground)]/85">
              {step}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
