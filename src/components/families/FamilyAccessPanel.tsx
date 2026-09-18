"use client";

/**
 * "Can't sign in?" — the desk-side of parent account recovery.
 *
 * A parent rings the centre locked out. Before this, there was nothing staff
 * could do: the portal had no password reset at all, and no way to set one on
 * a family's behalf. The answer was "I'll get back to you", which is how a
 * family ends up not using the portal.
 *
 * Reset link first and set-a-password last, deliberately. Emailing a link
 * leaves the password known only to the parent; typing one for them means a
 * staff member knows it, which is occasionally necessary and never the default.
 */
import { useState } from "react";
import { KeyRound, Mail, Loader2, ShieldAlert } from "lucide-react";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";

type Action = "send_reset" | "send_login" | "set_password";

export function FamilyAccessPanel({
  familyId,
  email,
  deactivated,
  canSetPassword,
}: {
  familyId: string;
  email: string;
  /** Portal access switched off — every action here is pointless until it's on. */
  deactivated: boolean;
  /** owner/admin only: typing a password for someone else is the exception. */
  canSetPassword: boolean;
}) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [password, setPassword] = useState("");

  const run = async (action: Action, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      await mutateApi(`/api/families/${familyId}/access`, {
        method: "POST",
        body: { action, ...extra },
      });
      if (action === "set_password") {
        setShowSetPassword(false);
        setPassword("");
        toast({
          description: `Password set. Read it out to them now — it isn't stored anywhere you can look it up again.`,
        });
      } else {
        toast({
          description: `Sent to ${email}. It works for one hour.`,
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error ? err.message : "Couldn't do that — try again.",
      });
    } finally {
      setBusy(null);
    }
  };

  if (deactivated) {
    return (
      <div className="mt-4 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground">Can&apos;t sign in?</h3>
        <p className="mt-1 text-xs text-muted">
          Switch their portal access back on first — a new password won&apos;t
          let them in while it&apos;s off.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-foreground">Can&apos;t sign in?</h3>
      <p className="mt-1 text-xs text-muted">
        Links go to <span className="font-medium text-foreground">{email}</span>{" "}
        and last one hour.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => run("send_reset")}
          disabled={busy !== null}
        >
          {busy === "send_reset" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          Email a password reset
        </Button>

        <Button
          variant="outline"
          onClick={() => run("send_login")}
          disabled={busy !== null}
        >
          {busy === "send_login" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mail className="h-4 w-4" />
          )}
          Email a one-time sign-in link
        </Button>

        {canSetPassword && !showSetPassword && (
          <Button
            variant="ghost"
            onClick={() => setShowSetPassword(true)}
            disabled={busy !== null}
          >
            Set a password directly
          </Button>
        )}
      </div>

      {showSetPassword && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <div className="flex gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-amber-900 dark:text-amber-200">
                Only for a parent who can&apos;t receive our email. You&apos;ll
                know their password, so read it out and ask them to change it in
                the portal. Recorded against your name in the audit log.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 10 characters"
                  aria-label="New password for this family"
                  className="min-w-[220px] flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <Button
                  onClick={() => run("set_password", { password })}
                  disabled={password.length < 10 || busy !== null}
                >
                  {busy === "set_password" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Set password
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowSetPassword(false);
                    setPassword("");
                  }}
                  disabled={busy !== null}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
