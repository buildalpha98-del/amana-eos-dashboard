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
    model: opts.model ?? "claude-sonnet-4-20250514",
    max_tokens: opts.maxTokens ?? 1000,
    system: opts.system,
    temperature: opts.temperature,
    messages: [{ role: "user", content: prompt }],
  });
  const block = res.content[0];
  if (block?.type !== "text") return "";
  return block.text;
}
