/**
 * Australian postcode → state mapping.
 * Deterministic ranges — no external API required.
 */
export function stateFromPostcode(postcode: string): string | null {
  const code = parseInt(postcode, 10);
  if (isNaN(code)) return null;

  // ACT ranges (must check before NSW to avoid overlap)
  if (code >= 2600 && code <= 2618) return "ACT";
  if (code >= 2900 && code <= 2920) return "ACT";

  // NSW
  if (code >= 2000 && code <= 2599) return "NSW";
  if (code >= 2619 && code <= 2899) return "NSW";
  if (code >= 2921 && code <= 2999) return "NSW";

  // VIC
  if (code >= 3000 && code <= 3999) return "VIC";

  // QLD
  if (code >= 4000 && code <= 4999) return "QLD";

  // SA
  if (code >= 5000 && code <= 5799) return "SA";

  // WA
  if (code >= 6000 && code <= 6797) return "WA";

  // TAS
  if (code >= 7000 && code <= 7799) return "TAS";

  // NT
  if (code >= 800 && code <= 899) return "NT";

  return null;
}
