/**
 * Replace {{tag}} placeholders in a template string with values from the data object.
 * Unknown tags are left as-is.
 */
export function applyMergeTags(
  template: string,
  data: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => data[key] ?? match);
}
