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
  ROLE_LABEL_DEFAULTS,
  type OrgSettingsConfig,
  type RoleLabels,
} from "@/lib/org-settings-shared";
import {
  CHECKLISTS,
  type RoleKey as ChecklistRoleKey,
} from "@/lib/getting-started-checklists";

const ROLE_KEYS: (keyof RoleLabels)[] = [
  "owner",
  "head_office",
  "admin",
  "marketing",
  "member",
  "staff",
  "eos_viewer",
  "eos_implementer",
  "eos",
];

const ROLE_HINTS: Record<keyof RoleLabels, string> = {
  owner: "Permission tier — full access to everything",
  head_office: "Region / state-wide manager",
  admin: "Org-wide operations admin",
  marketing: "Marketing team scope",
  member: "Service-level lead (legacy: Director of Service)",
  staff: "On-shift educator",
  eos_viewer: "View-only access to the EOS surface — coaches / advisors",
  eos_implementer: "Full write access to the EOS surface (org-wide) — the EOS implementer",
  eos: "Broad EOS Member — full EOS surface plus Services / Operations / Growth / People",
};

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
  const labelsValid = ROLE_KEYS.every(
    (k) => config.roleLabels[k].trim().length > 0,
  );
  const onboardingValid =
    config.onboardingWelcome.title.trim().length > 0 &&
    config.onboardingWelcome.body.trim().length > 0;
  const welcomePackValid =
    config.welcomePack.welcomeIntro.trim().length > 0 &&
    config.welcomePack.ratesIntro.trim().length > 0 &&
    config.welcomePack.enrolSteps.trim().length > 0 &&
    config.welcomePack.programmes.length > 0 &&
    config.welcomePack.programmes.every(
      (p) => p.name.trim().length > 0 && p.desc.trim().length > 0,
    );
  const canSave =
    weightsValid &&
    thresholdsValid &&
    ratioValid &&
    emailValid &&
    labelsValid &&
    onboardingValid &&
    welcomePackValid;

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

      {/* Welcome pack PDF (parent-facing) */}
      <Section
        title="Welcome Pack PDF (parent-facing)"
        description="The PDF that's emailed to new-enquiry parents. Programme descriptions, pricing intro, enrolment steps, contact details, and footer line — all editable here. Templates support {{parentName}}, {{childName}}, {{childRef}} (' and Sara' or blank), and {{centreName}} placeholders rendered at PDF-generation time."
        onReset={() =>
          setConfig((c) => ({
            ...c,
            welcomePack: ORG_SETTINGS_DEFAULTS.welcomePack,
          }))
        }
      >
        <Field label="Welcome paragraph" valid={config.welcomePack.welcomeIntro.trim().length > 0} error="Cannot be blank">
          <textarea
            rows={5}
            value={config.welcomePack.welcomeIntro}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                welcomePack: { ...c.welcomePack, welcomeIntro: e.target.value },
              }))
            }
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 resize-y"
          />
        </Field>
        <Field label="Session rates intro" valid={config.welcomePack.ratesIntro.trim().length > 0} error="Cannot be blank">
          <textarea
            rows={4}
            value={config.welcomePack.ratesIntro}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                welcomePack: { ...c.welcomePack, ratesIntro: e.target.value },
              }))
            }
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 resize-y"
          />
        </Field>
        <Field label="How to enrol" valid={config.welcomePack.enrolSteps.trim().length > 0} error="Cannot be blank">
          <textarea
            rows={6}
            value={config.welcomePack.enrolSteps}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                welcomePack: { ...c.welcomePack, enrolSteps: e.target.value },
              }))
            }
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 resize-y"
          />
        </Field>
        <Field label="Contact phone" valid={true}>
          <input
            type="text"
            value={config.welcomePack.contactPhone}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                welcomePack: { ...c.welcomePack, contactPhone: e.target.value },
              }))
            }
            className="w-48 rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </Field>
        <Field label="Contact email" valid={true}>
          <input
            type="email"
            value={config.welcomePack.contactEmail}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                welcomePack: { ...c.welcomePack, contactEmail: e.target.value },
              }))
            }
            className="w-72 rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </Field>
        <Field label="Contact website" valid={true}>
          <input
            type="text"
            value={config.welcomePack.contactWebsite}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                welcomePack: { ...c.welcomePack, contactWebsite: e.target.value },
              }))
            }
            className="w-72 rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </Field>
        <Field label="Footer line" valid={true}>
          <input
            type="text"
            value={config.welcomePack.footerLine}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                welcomePack: { ...c.welcomePack, footerLine: e.target.value },
              }))
            }
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </Field>
        <div className="space-y-2 pt-3 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-foreground">Programmes</div>
            <button
              type="button"
              onClick={() =>
                setConfig((c) => ({
                  ...c,
                  welcomePack: {
                    ...c.welcomePack,
                    programmes: [
                      ...c.welcomePack.programmes,
                      { name: "", desc: "" },
                    ],
                  },
                }))
              }
              className="text-xs underline text-brand hover:text-brand-hover"
            >
              + Add programme
            </button>
          </div>
          {config.welcomePack.programmes.map((p, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 p-3 rounded-md border border-border bg-surface/50">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={p.name}
                  placeholder="Programme name"
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      welcomePack: {
                        ...c.welcomePack,
                        programmes: c.welcomePack.programmes.map((pp, idx) =>
                          idx === i ? { ...pp, name: e.target.value } : pp,
                        ),
                      },
                    }))
                  }
                  className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand/40"
                />
                {config.welcomePack.programmes.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setConfig((c) => ({
                        ...c,
                        welcomePack: {
                          ...c.welcomePack,
                          programmes: c.welcomePack.programmes.filter((_, idx) => idx !== i),
                        },
                      }))
                    }
                    className="text-xs underline text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
              <textarea
                value={p.desc}
                rows={2}
                placeholder="Description shown to parents"
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    welcomePack: {
                      ...c.welcomePack,
                      programmes: c.welcomePack.programmes.map((pp, idx) =>
                        idx === i ? { ...pp, desc: e.target.value } : pp,
                      ),
                    },
                  }))
                }
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 resize-y"
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Onboarding welcome announcement */}
      <Section
        title="Onboarding welcome announcement"
        description="The announcement seeded the first time a new user logs in. Used to be hardcoded with specific exec names — keep it fresh as the team changes. Existing welcome announcements aren't retroactively rewritten; only newly-onboarded users see the latest copy."
        onReset={() =>
          setConfig((c) => ({
            ...c,
            onboardingWelcome: ORG_SETTINGS_DEFAULTS.onboardingWelcome,
          }))
        }
      >
        <Field
          label="Title"
          valid={config.onboardingWelcome.title.trim().length > 0}
          error="Cannot be blank"
        >
          <input
            type="text"
            value={config.onboardingWelcome.title}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                onboardingWelcome: {
                  ...c.onboardingWelcome,
                  title: e.target.value,
                },
              }))
            }
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </Field>
        <Field
          label="Body"
          valid={config.onboardingWelcome.body.trim().length > 0}
          error="Cannot be blank"
        >
          <textarea
            value={config.onboardingWelcome.body}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                onboardingWelcome: {
                  ...c.onboardingWelcome,
                  body: e.target.value,
                },
              }))
            }
            rows={10}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 font-mono resize-y"
          />
        </Field>
        <div className="text-xs text-muted">
          Markdown is supported on the rendering side (bold, lists, etc.).
        </div>
      </Section>

      {/* Getting Started checklist overrides */}
      <ChecklistOverridesSection config={config} setConfig={setConfig} />

      {/* Role guide welcome messages */}
      <Section
        title="Role guide welcome messages"
        description="Greeting shown at the top of /guides for each role. Use this to keep names + cadence references fresh (e.g. seasonal welcomes). Blank = falls back to the code default."
        onReset={() =>
          setConfig((c) => ({
            ...c,
            roleGuides: {
              owner: { welcomeMessage: "" },
              head_office: { welcomeMessage: "" },
              admin: { welcomeMessage: "" },
              marketing: { welcomeMessage: "" },
              member: { welcomeMessage: "" },
              staff: { welcomeMessage: "" },
              eos_viewer: { welcomeMessage: "" },
              eos_implementer: { welcomeMessage: "" },
              eos: { welcomeMessage: "" },
            },
          }))
        }
      >
        {ROLE_KEYS.map((key) => (
          <Field
            key={key}
            label={config.roleLabels[key]}
            valid={true}
            hint={key}
          >
            <textarea
              value={config.roleGuides[key].welcomeMessage}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  roleGuides: {
                    ...c.roleGuides,
                    [key]: { welcomeMessage: e.target.value },
                  },
                }))
              }
              rows={2}
              placeholder="Defaults to the code-shipped welcome — leave blank to use it."
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 resize-y"
            />
          </Field>
        ))}
      </Section>

      {/* Role labels */}
      <Section
        title="Role display names"
        description="What each role is called across the dashboard UI — sidebars, badges, dropdowns, page headers. Permission scopes are tied to the underlying role keys (Owner, head_office, admin, etc.) — only the label is editable. New labels propagate within a few seconds of saving."
        onReset={() => setConfig((c) => ({ ...c, roleLabels: ROLE_LABEL_DEFAULTS }))}
      >
        {ROLE_KEYS.map((key) => (
          <Field
            key={key}
            label={ROLE_HINTS[key]}
            valid={config.roleLabels[key].trim().length > 0}
            error="Cannot be blank"
            hint={key}
          >
            <input
              type="text"
              value={config.roleLabels[key]}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  roleLabels: { ...c.roleLabels, [key]: e.target.value },
                }))
              }
              className="w-56 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </Field>
        ))}
      </Section>

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

      {/* Grocery rates */}
      <Section
        title="Grocery rates per head"
        description="Per-child grocery cost used by the Financial Dashboard and each centre's Budget tab to forecast weekly grocery spend. One set applies to every centre. Attendance × rate = forecast."
        onReset={() => resetSection("groceryRates")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field
            label="Rise & Shine (before school care)"
            valid={config.groceryRates.bsc > 0}
            error="Must be > $0"
          >
            <div className="relative">
              <span className="absolute inset-y-0 left-2 flex items-center text-sm text-muted pointer-events-none">
                $
              </span>
              <input
                type="number"
                min={0}
                step={0.05}
                value={config.groceryRates.bsc}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    groceryRates: {
                      ...c.groceryRates,
                      bsc: Number(e.target.value),
                    },
                  }))
                }
                className="w-full rounded-md border border-border bg-card pl-6 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </div>
          </Field>
          <Field
            label="Minor Afternoons (after school care)"
            valid={config.groceryRates.asc > 0}
            error="Must be > $0"
          >
            <div className="relative">
              <span className="absolute inset-y-0 left-2 flex items-center text-sm text-muted pointer-events-none">
                $
              </span>
              <input
                type="number"
                min={0}
                step={0.05}
                value={config.groceryRates.asc}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    groceryRates: {
                      ...c.groceryRates,
                      asc: Number(e.target.value),
                    },
                  }))
                }
                className="w-full rounded-md border border-border bg-card pl-6 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </div>
          </Field>
          <Field
            label="Holiday Quest (vacation care)"
            valid={config.groceryRates.vc > 0}
            error="Must be > $0"
          >
            <div className="relative">
              <span className="absolute inset-y-0 left-2 flex items-center text-sm text-muted pointer-events-none">
                $
              </span>
              <input
                type="number"
                min={0}
                step={0.05}
                value={config.groceryRates.vc}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    groceryRates: {
                      ...c.groceryRates,
                      vc: Number(e.target.value),
                    },
                  }))
                }
                className="w-full rounded-md border border-border bg-card pl-6 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </div>
          </Field>
        </div>
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

/**
 * ChecklistOverridesSection — Getting Started checklist editor.
 *
 * One role expanded at a time; each item shows the code-shipped default
 * title + description as placeholders, with override inputs above.
 * Saving persists per-key `{ title?, description? }` to
 * OrgSettings.config.checklistOverrides[role]. Blank overrides fall back
 * to the canonical defaults.
 *
 * `href`, `icon`, and `category` stay code-driven (admin can't redirect
 * an item at a non-existent route or arbitrary icon).
 *
 * 2026-05-17.
 */
function ChecklistOverridesSection({
  config,
  setConfig,
}: {
  config: OrgSettingsConfig;
  setConfig: React.Dispatch<React.SetStateAction<OrgSettingsConfig>>;
}) {
  const [activeRole, setActiveRole] = useState<ChecklistRoleKey>("staff");
  const roleEntries: Array<[ChecklistRoleKey, string]> = [
    ["staff", config.roleLabels.staff],
    ["member", config.roleLabels.member],
    ["marketing", config.roleLabels.marketing],
    ["admin", config.roleLabels.admin],
    ["head_office", config.roleLabels.head_office],
    ["owner", config.roleLabels.owner],
  ];

  const items = CHECKLISTS[activeRole] ?? [];
  const overridesForRole = config.checklistOverrides[activeRole] ?? {};

  function setOverride(
    key: string,
    field: "title" | "description",
    value: string,
  ) {
    setConfig((c) => {
      const existing = { ...(c.checklistOverrides[activeRole] ?? {}) };
      const item = { ...(existing[key] ?? {}) };
      if (value.trim().length === 0) {
        delete item[field];
      } else {
        item[field] = value;
      }
      if (Object.keys(item).length === 0) {
        delete existing[key];
      } else {
        existing[key] = item;
      }
      return {
        ...c,
        checklistOverrides: {
          ...c.checklistOverrides,
          [activeRole]: existing,
        },
      };
    });
  }

  const overrideCount = (role: ChecklistRoleKey) =>
    Object.keys(config.checklistOverrides[role] ?? {}).length;

  return (
    <Section
      title="Getting Started checklist overrides"
      description="Override the title or description shown to each role on /getting-started. Blank inputs fall back to the code default below. `href`, icon, and category stay code-driven — admin can't redirect items at non-existent routes."
      onReset={() =>
        setConfig((c) => ({
          ...c,
          checklistOverrides: ORG_SETTINGS_DEFAULTS.checklistOverrides,
        }))
      }
    >
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {roleEntries.map(([role, label]) => {
          const isActive = activeRole === role;
          const count = overrideCount(role);
          return (
            <button
              key={role}
              type="button"
              onClick={() => setActiveRole(role)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                isActive
                  ? "border-brand bg-brand/10 text-brand font-semibold"
                  : "border-border bg-card text-muted hover:bg-surface"
              }`}
            >
              {label}
              {count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full bg-brand text-white text-2xs font-semibold">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-3 pt-2">
        {items.length === 0 && (
          <p className="text-sm text-muted italic">
            No checklist items defined for this role yet.
          </p>
        )}
        {items.map((item) => {
          const override = overridesForRole[item.key] ?? {};
          const hasOverride =
            (override.title && override.title.length > 0) ||
            (override.description && override.description.length > 0);
          return (
            <div
              key={item.key}
              className={`rounded-md border p-3 space-y-2 ${
                hasOverride
                  ? "border-brand/60 bg-brand/5"
                  : "border-border bg-surface/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs text-muted font-mono">{item.key}</code>
                <span className="text-2xs uppercase tracking-wider text-muted">
                  {item.category}
                </span>
              </div>
              <input
                type="text"
                value={override.title ?? ""}
                placeholder={item.title}
                onChange={(e) =>
                  setOverride(item.key, "title", e.target.value)
                }
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
              <textarea
                rows={2}
                value={override.description ?? ""}
                placeholder={item.description}
                onChange={(e) =>
                  setOverride(item.key, "description", e.target.value)
                }
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 resize-y"
              />
            </div>
          );
        })}
      </div>
    </Section>
  );
}
