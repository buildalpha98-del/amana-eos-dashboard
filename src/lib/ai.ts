import Anthropic from "@anthropic-ai/sdk";

// Lazy singleton — Anthropic only initialises when actually called,
// preventing build-time errors when ANTHROPIC_API_KEY isn't set.
let _anthropic: Anthropic | null = null;

export function getAI(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

export interface GenerateTextOptions {
  model?: string;
  maxTokens?: number;
  system?: string;
  temperature?: number;
}

/**
 * Non-streaming LLM call. Test seam: mock via `vi.mock("@/lib/ai", () => ({ generateText: vi.fn() }))`.
 */
export async function generateText(
  prompt: string,
  opts: GenerateTextOptions = {},
): Promise<string> {
  const ai = getAI();
  if (!ai) {
    throw new Error(
      "AI is not configured. Set ANTHROPIC_API_KEY environment variable.",
    );
  }
  const res = await ai.messages.create({
    model: opts.model ?? "claude-haiku-4-5-20251001",
    max_tokens: opts.maxTokens ?? 1000,
    system: opts.system,
    temperature: opts.temperature,
    messages: [{ role: "user", content: prompt }],
  });
  // Claude 4.5+/5 responses can lead with thinking blocks — the text block is
  // not necessarily content[0]. Join every text block.
  return res.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}
