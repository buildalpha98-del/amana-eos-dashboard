import Anthropic from "@anthropic-ai/sdk";
import {
  estimateCost,
  type GenerateStructuredOptions,
  type GenerateStructuredResult,
} from "./types";
import { extractJson } from "./json";

let _client: Anthropic | null = null;

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured — cannot call Anthropic provider.",
    );
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export async function generateStructuredAnthropic<T>(
  modelId: string,
  opts: GenerateStructuredOptions<T>,
): Promise<GenerateStructuredResult<T>> {
  const ai = client();

  const systemWithJson =
    `${opts.system}\n\nReply with VALID JSON ONLY. No prose, no markdown fences. The JSON must conform to the agreed schema. If a field has no good answer, omit it.`;

  const callOnce = async (): Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
  }> => {
    const res = await ai.messages.create({
      model: modelId,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.4,
      system: systemWithJson,
      messages: [{ role: "user", content: opts.prompt }],
    });
    const block = res.content[0];
    const text = block && "text" in block ? block.text : "";
    return {
      text,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    };
  };

  // Try once; on parse failure, ask again with the parser error in the prompt.
  let attempt = await callOnce();
  let parsedJson = extractJson(attempt.text);
  let parsed = opts.schema.safeParse(parsedJson);

  if (!parsed.success) {
    const repairOpts = {
      ...opts,
      prompt: `${opts.prompt}\n\nYour previous response did not validate against the required JSON schema. Return ONLY the JSON object — no commentary.`,
    };
    const repaired = await ai.messages.create({
      model: modelId,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.4,
      system: systemWithJson,
      messages: [{ role: "user", content: repairOpts.prompt }],
    });
    const block = repaired.content[0];
    const text = block && "text" in block ? block.text : "";
    attempt = {
      text,
      inputTokens: attempt.inputTokens + repaired.usage.input_tokens,
      outputTokens: attempt.outputTokens + repaired.usage.output_tokens,
    };
    parsedJson = extractJson(text);
    parsed = opts.schema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new Error(
        "AI generation produced invalid JSON for the requested schema (after one retry).",
      );
    }
  }

  return {
    data: parsed.data as T,
    provider: "anthropic",
    modelId,
    inputTokens: attempt.inputTokens,
    outputTokens: attempt.outputTokens,
    costUsd: estimateCost(modelId, attempt.inputTokens, attempt.outputTokens),
  };
}
