/**
 * Manifest of admin-editable transactional email templates.
 *
 * Each entry binds a stable `key` to a human label + the variables the
 * template substitutes at render time. The editor at /settings/email-templates
 * uses this list to know what's editable and what placeholders are valid.
 *
 * Variables are substituted via `{{name}}` syntax; see `interpolateTemplate()`
 * below. The editor shows the variable list as a hint so admins don't have
 * to remember them.
 *
 * 2026-05-17: introduced as part of the editable-templates rollout. The
 * registry below covers an initial slice — every transactional template
 * that's high-impact and exec-name-sensitive. Other templates remain
 * hardcoded until the consumer is migrated; adding one means listing it
 * here and updating its template function to call
 * `applyEmailTemplateOverride()`.
 */

export interface EmailTemplateManifestEntry {
  /** Stable identifier; namespaced by domain module (e.g. "auth.welcomeEmail"). */
  key: string;
  /** Module bucket — drives the grouping on the editor list page. */
  category: "Auth" | "Waitlist" | "Notifications" | "Parent" | "Nurture";
  /** Human label for the editor list. */
  label: string;
  /** One-line description of when this template is sent. */
  description: string;
  /** Variables interpolated at send time (e.g. {{name}}, {{loginUrl}}). */
  variables: Array<{ name: string; description: string }>;
}

export const EMAIL_TEMPLATE_MANIFEST: EmailTemplateManifestEntry[] = [
  {
    key: "auth.welcomeEmail",
    category: "Auth",
    label: "Welcome email (new user)",
    description:
      "Sent the first time an admin creates a dashboard user, with a temporary password.",
    variables: [
      { name: "name", description: "User's first name" },
      { name: "tempPassword", description: "Temporary password to display" },
      { name: "loginUrl", description: "Dashboard sign-in URL" },
    ],
  },
  {
    key: "auth.passwordReset",
    category: "Auth",
    label: "Password reset",
    description: "Sent when a user requests a password reset.",
    variables: [
      { name: "name", description: "User's first name" },
      { name: "resetUrl", description: "Single-use reset URL (1h TTL)" },
    ],
  },
];

export function getEmailTemplateManifestEntry(
  key: string,
): EmailTemplateManifestEntry | null {
  return EMAIL_TEMPLATE_MANIFEST.find((e) => e.key === key) ?? null;
}

/**
 * Substitute `{{name}}` placeholders. Unknown placeholders are left as-is so
 * a partial / outdated override doesn't blank out a real variable.
 */
export function interpolateTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : match,
  );
}
