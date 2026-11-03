import { ApiError } from "@/lib/api-error";

/**
 * Default-deny boundary for external AI. There is deliberately no environment
 * toggle, client flag or prompt instruction that can bypass this control.
 * Re-enabling a workflow requires a reviewed, explicit release mechanism.
 * Keep this check immediately before SDK/network dispatch, including retries.
 */
export function assertExternalAiAllowed(): void {
  throw new ApiError(403, "External AI processing is blocked to protect personal information. You can continue working manually.", { code: "AI_PRIVACY_BLOCKED" });
}
