/**
 * Convert a user-entered tag label (e.g. "Project Code") into the
 * canonical merge-tag key used everywhere else in the system (
 * `custom.projectCode`).
 *
 * Rules:
 *  - Always lower-case
 *  - Non-alphanumeric characters are treated as word separators
 *  - Words are concatenated camelCase (first word lower, rest capitalised)
 *  - Numbers are kept verbatim
 *  - Always prefixed `custom.` so we never collide with the hardcoded
 *    `staff.*`, `service.*`, `contract.*`, `manager.*`, `system.*` / bare
 *    `today` / `letterDate` keys
 *  - Returns "" when the input has zero alphanumeric content — the caller
 *    treats that as "invalid, refuse to save"
 *
 * Examples:
 *   "Project Code"   -> "custom.projectCode"
 *   "client name"    -> "custom.clientName"
 *   "Tax ID"         -> "custom.taxId"
 *   "  ABC  "        -> "custom.abc"
 *   "hello_world"    -> "custom.helloWorld"
 *   "123 abc"        -> "custom.123Abc"
 *   "!!!"            -> ""
 *   ""               -> ""
 */
export function toCustomTagKey(input: string): string {
  const parts = input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  const [first, ...rest] = parts;
  const camel =
    first +
    rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  return `custom.${camel}`;
}

/** Prefix used for every user-defined merge tag. */
export const CUSTOM_TAG_PREFIX = "custom.";

/** True when `key` looks like a user-defined custom tag. */
export function isCustomTagKey(key: string): boolean {
  return key.startsWith(CUSTOM_TAG_PREFIX) && key.length > CUSTOM_TAG_PREFIX.length;
}
