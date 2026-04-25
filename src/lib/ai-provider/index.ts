/**
 * Public entrypoint for the hybrid AI provider.
 *
 * Call sites pick a `providerModel` (Anthropic Sonnet for showcase prose,
 * Groq + Llama for bulk drafts) and pass a Zod schema to validate the JSON
 * output. Cache hits and DB writes are the responsibility of the caller —
 * this module only wraps the model call.
 */

import { generateStructuredAnthropic } from "./anthropic";
import { generateStructuredGroq } from "./groq";
import {
  DEFAULT_PROVIDER_MODEL,
  type GenerateStructuredOptions,
  type GenerateStructuredResult,
  type ProviderModel,
} from "./types";

export {
  DEFAULT_PROVIDER_MODEL,
  type GenerateStructuredOptions,
  type GenerateStructuredResult,
  type ProviderModel,
  type Provider,
} from "./types";
export { extractJson } from "./json";

export async function generateStructured<T>(
  opts: GenerateStructuredOptions<T>,
): Promise<GenerateStructuredResult<T>> {
  const pm: ProviderModel = opts.providerModel ?? DEFAULT_PROVIDER_MODEL.showcase;

  switch (pm.provider) {
    case "anthropic":
      return generateStructuredAnthropic<T>(pm.modelId, opts);
    case "groq":
      return generateStructuredGroq<T>(pm.modelId, opts);
    default: {
      const _exhaustive: never = pm.provider;
      throw new Error(`Unknown AI provider: ${_exhaustive as string}`);
    }
  }
}
