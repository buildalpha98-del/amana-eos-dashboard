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
