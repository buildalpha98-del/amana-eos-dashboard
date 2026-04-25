import {
  estimateCost,
  type GenerateStructuredOptions,
  type GenerateStructuredResult,
} from "./types";
import { extractJson } from "./json";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

interface GroqChatResponse {
  choices: Array<{ message: { content: string } }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

async function callGroqChat(
  modelId: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not configured — cannot call Groq provider.",
    );
  }

  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      temperature,
      // Groq supports the OpenAI-compatible response_format hint to encourage
      // valid JSON output. Not all models honour it; we still validate.
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Groq API error ${res.status}: ${errBody.slice(0, 500)}`);
  }

  const json = (await res.json()) as GroqChatResponse;
  const text = json.choices[0]?.message?.content ?? "";
  return {
    text,
    inputTokens: json.usage.prompt_tokens,
    outputTokens: json.usage.completion_tokens,
  };
}

export async function generateStructuredGroq<T>(
  modelId: string,
  opts: GenerateStructuredOptions<T>,
): Promise<GenerateStructuredResult<T>> {
  const systemWithJson = `${opts.system}\n\nReply with VALID JSON ONLY. No prose, no markdown fences.`;

  const maxTokens = opts.maxTokens ?? 2048;
  const temperature = opts.temperature ?? 0.4;

  let attempt = await callGroqChat(
    modelId,
    systemWithJson,
    opts.prompt,
    maxTokens,
    temperature,
  );
  let parsedJson = extractJson(attempt.text);
  let parsed = opts.schema.safeParse(parsedJson);

  if (!parsed.success) {
    const repaired = await callGroqChat(
      modelId,
      systemWithJson,
      `${opts.prompt}\n\nYour previous response did not validate against the required JSON schema. Return ONLY the JSON object.`,
      maxTokens,
      temperature,
    );
    attempt = {
      text: repaired.text,
      inputTokens: attempt.inputTokens + repaired.inputTokens,
      outputTokens: attempt.outputTokens + repaired.outputTokens,
    };
    parsedJson = extractJson(repaired.text);
    parsed = opts.schema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new Error(
        "AI generation produced invalid JSON for the requested schema (after one retry).",
      );
    }
  }

  return {
    data: parsed.data as T,
    provider: "groq",
    modelId,
    inputTokens: attempt.inputTokens,
    outputTokens: attempt.outputTokens,
    costUsd: estimateCost(modelId, attempt.inputTokens, attempt.outputTokens),
  };
}
