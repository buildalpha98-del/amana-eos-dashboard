"use client";

/**
 * "Use this iPad at the door?" — on the centre's Today screen (Round 4,
 * 2026-10-09). Sets THIS device up as the centre's door iPad (a Kiosk
 * pairing whose token stays in this browser), then becomes the one-tap
 * "Switch to Parent mode".
 *
 * Shown on a touch screen the size of an iPad, or anywhere that's already
 * paired — a phone isn't a door iPad, and a laptop is set up on purpose
 * from the same card if it is ever needed (?door=1).
 */
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tablet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

const TOKEN_KEY = "amana.kiosk.token";
const LABEL_KEY = "amana.kiosk.label";

function readPaired(): boolean {
  try {
    return Boolean(window.localStorage.getItem(TOKEN_KEY));
  } catch {
    return false;
  }
}

function looksLikeTablet(): boolean {
  return window.matchMedia("(pointer: coarse) and (min-width: 700px)").matches;
}

export function DoorIpadCard({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const forced = useSearchParams()?.get("door") === "1";
  const [paired, setPaired] = useState<boolean | null>(null);
  const [tablet, setTablet] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads this device's pairing + screen
    setPaired(readPaired());
    setTablet(looksLikeTablet());
  }, []);

  if (paired === null || (!paired && !tablet && !forced)) return null;

  async function setUp() {
    setBusy(true);
    try {
      const r = await mutateApi<{ token: string; kiosk: { label: string } }>(
        `/api/services/${serviceId}/door-ipad`,
        { method: "POST" },
      );
      window.localStorage.setItem(TOKEN_KEY, r.token);
      window.localStorage.setItem(LABEL_KEY, r.kiosk.label);
      setPaired(true);
      toast({ description: "This iPad is now the door iPad." });
    } catch (e) {
      toast({ variant: "destructive", description: e instanceof Error ? e.message : "Couldn't set up this iPad." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Door iPad"
      className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-accent bg-card p-4"
    >
      <Tablet className="h-8 w-8 shrink-0 text-brand" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-heading font-semibold text-foreground">
          {paired ? "This is the door iPad" : "Use this iPad at the door?"}
        </p>
        <p className="text-sm text-muted">
          {paired
            ? "Families sign their children in and out. Staff switch back with their clock-in PIN."
            : "Families sign their own children in and out on it. Staff switch back with their PIN."}
        </p>
      </div>
      {paired ? (
        <Button size="lg" className="bg-accent text-brand hover:bg-accent/90" onClick={() => router.push("/door")}>
          Switch to Parent mode
        </Button>
      ) : (
        <Button size="lg" onClick={setUp} disabled={busy}>
          {busy ? "Setting up…" : "Set up as the door iPad"}
        </Button>
      )}
      {/* A web page can't stop the Home button; iPad's Guided Access can. */}
      {paired && (
        <details className="w-full text-sm">
          <summary className="cursor-pointer font-medium text-brand">Lock this iPad to the door screen</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-foreground">
            <li>In Safari, open Parent mode, tap Share, then <strong>Add to Home Screen</strong>. Open it from the new icon from now on.</li>
            <li>In the iPad&rsquo;s Settings, go to <strong>Accessibility → Guided Access</strong>, turn it on and set a passcode only the Coordinator knows.</li>
            <li>Open the app in Parent mode and triple-click the top (or Home) button, then tap <strong>Start</strong>. The iPad now stays on this screen.</li>
            <li>To stop it, triple-click again and enter the Guided Access passcode.</li>
          </ol>
        </details>
      )}
    </section>
  );
}
