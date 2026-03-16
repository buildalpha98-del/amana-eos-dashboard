"use client";

import { useEffect } from "react";
import { Sparkles, Loader2, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiGenerate, type AiGenerateOptions } from "@/hooks/useAiGenerate";

interface AiButtonProps {
  templateSlug: string;
  variables?: Record<string, string>;
  onResult: (text: string) => void;
  /** Called on each streaming chunk with the accumulated text so far */
  onStream?: (partialText: string) => void;
  stream?: boolean;
  model?: string;
  section?: string;
  metadata?: Record<string, unknown>;
  label?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export function AiButton({
  templateSlug,
  variables = {},
  onResult,
  onStream,
  stream = false,
  model,
  section,
  metadata,
  label = "Generate with AI",
  disabled = false,
  className,
  size = "md",
}: AiButtonProps) {
  const { generate, isLoading, streamedText, cancel } = useAiGenerate();

  // Forward streamed text to parent as it arrives
  useEffect(() => {
    if (stream && onStream && streamedText) {
      onStream(streamedText);
    }
  }, [stream, onStream, streamedText]);

  const handleClick = async () => {
    const options: AiGenerateOptions = {
      templateSlug,
      variables,
      stream,
      model,
      section,
      metadata,
    };

    const result = await generate(options);
    if (result) {
      onResult(result);
    }
  };

  const sizeClasses = size === "sm"
    ? "px-2.5 py-1.5 text-xs gap-1.5"
    : "px-3 py-2 text-sm gap-2";

  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  if (isLoading) {
    return (
      <button
        onClick={cancel}
        className={cn(
          "inline-flex items-center font-medium rounded-lg border transition-colors",
          "border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100",
          sizeClasses,
          className,
        )}
      >
        <Loader2 className={cn(iconSize, "animate-spin")} />
        Generating…
        <Square className="w-3 h-3 ml-1" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center font-medium rounded-lg border transition-colors",
        "border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        sizeClasses,
        className,
      )}
    >
      <Sparkles className={iconSize} />
      {label}
    </button>
  );
}
