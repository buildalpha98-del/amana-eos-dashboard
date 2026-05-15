"use client";

/**
 * /settings/organisation — owner/admin form for the org-wide runtime
 * configuration that used to be hardcoded:
 *
 *   - Email (Brevo sender identity)
 *   - Default educator-to-children ratio
 *   - Centre Health Score pillar weights + thresholds
 *
 * Lives next to the legacy `/settings` page rather than inside it so the
 * form has room to breathe and so it can be deep-linked from documentation.
 * Server-side gating happens in page.tsx + the PATCH route; this component
 * trusts that it only renders for owner/admin.
 *
 * 2026-05-16.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "@/hooks/useToast";
import {
  ORG_SETTINGS_DEFAULTS,
  type OrgSettingsConfig,
} from "@/lib/org-settings-shared";

interface Props {
  initialConfig: OrgSettingsConfig;
}

type PillarKey = keyof OrgSettingsConfig["healthScore"]["pillarWeights"];

const PILLAR_LABELS: Record<PillarKey, string> = {
  financial: "Financial Performance",
  operational: "Operational Excellence",
  compliance: "Compliance & Safety",
  satisfaction: "Family Satisfaction",
  teamCulture: "Team & Culture",
};

export function OrganisationSettingsClient({ initialConfig }: Props) {
  const router = useRouter();
  const [config, setConfig] = useState<OrgSettingsConfig>(initialConfig);
  const [saving, setSaving] = useState(false);

  const weightsSum =
    config.healthScore.pillarWeights.financial +
    config.healthScore.pillarWeights.operational +
    config.healthScore.pillarWeights.compliance +
    config.healthScore.pillarWeights.satisfaction +
    config.healthScore.pillarWeights.teamCulture;

  const weightsValid = Math.abs(weightsSum - 1) < 0.001;
  const thresholdsValid =
    config.healthScore.thresholds.green > config.healthScore.thresholds.amber;
  const ratioValid = /^\d+:\d+$/.test(config.ratios.federalDefaultMinRatio);
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(
    config.email.senderEmail,
  );
  const canSave = weightsValid && thresholdsValid && ratioValid && emailValid;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/org-settings/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Save failed (${res.status})`);
      }
      toast({ description: "Organisation settings saved." });
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save settings";
      toast({ variant: "destructive", description: message });
    } finally {
      setSaving(false);
    }
  }

  function resetSection<K extends keyof OrgSettingsConfig>(key: K) {
    setConfig((c) => ({ ...c, [key]: ORG_SETTINGS_DEFAULTS[key] }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organisation Settings"
        description="Runtime configuration for the whole org. Saved changes apply within a minute across every dashboard surface — there's no deploy needed. Leaving a field at its default value falls through to the code default."
      />

      <div className="flex justify-end gap-2">
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!canSave || saving}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save changes
        </Button>
      </div>

      {/* Email */}
      <Section
        title="Outbound email sender"
        description="Identity used as the From / Reply-To on every transactional and campaign email the dashboard sends via Brevo. Defaults come from BREVO_SENDER_* env vars; changes here override them at runtime."
        onReset={() => resetSection("email")}
      >
        <Field label="Sender email" valid={emailValid} error="Must be a valid email address">
          <input
            type="email"
            value={config.email.senderEmail}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                email: { ...c.email, senderEmail: e.target.value },
              }))
            }
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </Field>
        <Field label="Sender display name" valid={config.email.senderName.length > 0} error="Cannot be blank">
          <input
            type="text"
            value={config.email.senderName}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                email: { ...c.email, senderName: e.target.value },
              }))
            }
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </Field>
      </Section>

      {/* Ratios */}
      <Section
        title="Default educator ratio"
        description="Fallback educator-to-child ratio used when a Service hasn't set its own per-session override. The federal OSHC default is 1:15."
        onReset={() => resetSection("ratios")}
      >
        <Field label="Federal default minimum ratio" valid={ratioValid} error="Use the form '1:15'">
          <input
            type="text"
            value={config.ratios.federalDefaultMinRatio}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                ratios: { ...c.ratios, federalDefaultMinRatio: e.target.value },
              }))
            }
            placeholder="1:15"
            className="w-32 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </Field>
      </Section>

      {/* Health Score */}
      <Section
        title="Centre Health Score"
        description="Pillar weights and color-band thresholds for the health score that drives the dashboard, performance, and history surfaces. Weights must sum to 1.0; green threshold must be greater than amber."
        onReset={() => resetSection("healthScore")}
      >
        <div className="space-y-3">
          <div className="text-sm font-medium text-foreground">Pillar weights</div>
          {(Object.keys(PILLAR_LABELS) as PillarKey[]).map((key) => (
            <Field
              key={key}
              label={PILLAR_LABELS[key]}
              valid={true}
              hint={`${(config.healthScore.pillarWeights[key] * 100).toFixed(0)}%`}
            >
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={config.healthScore.pillarWeights[key]}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    healthScore: {
                      ...c.healthScore,
                      pillarWeights: {
                        ...c.healthScore.pillarWeights,
                        [key]: Number(e.target.value),
                      },
                    },
                  }))
                }
                className="w-24 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </Field>
          ))}
          <div
            className={`text-xs ${
              weightsValid ? "text-muted" : "text-red-600 font-medium"
            }`}
          >
            Sum: {weightsSum.toFixed(3)} (must be 1.000)
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t border-border">
          <div className="text-sm font-medium text-foreground">
            Status thresholds (0-100)
          </div>
          <Field label="Green at or above" valid={thresholdsValid} error="Must be greater than amber">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={config.healthScore.thresholds.green}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  healthScore: {
                    ...c.healthScore,
                    thresholds: {
                      ...c.healthScore.thresholds,
                      green: Number(e.target.value),
                    },
                  },
                }))
              }
              className="w-24 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </Field>
          <Field label="Amber at or above" valid={true}>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={config.healthScore.thresholds.amber}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  healthScore: {
                    ...c.healthScore,
                    thresholds: {
                      ...c.healthScore.thresholds,
                      amber: Number(e.target.value),
                    },
                  },
                }))
              }
              className="w-24 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </Field>
          <div className="text-xs text-muted">
            Scores below {config.healthScore.thresholds.amber} render as red.
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  onReset,
  children,
}: {
  title: string;
  description: string;
  onReset: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">{description}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onReset}>
          Reset to default
        </Button>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  valid,
  error,
  hint,
  children,
}: {
  label: string;
  valid: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-sm text-foreground min-w-[200px]">{label}</span>
      <div className="flex items-center gap-2 flex-1 justify-end">
        {children}
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {!valid && error && (
        <span className="text-xs text-red-600 font-medium">{error}</span>
      )}
    </label>
  );
}
