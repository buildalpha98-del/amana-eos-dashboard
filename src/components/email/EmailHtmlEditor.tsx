"use client";

import { useRef, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Overrides the parent-email placeholder help (staff emails use {{firstName}}). */
  hint?: ReactNode;
}

// Exported emails from Zoho/Canva/Mailchimp run 20–200KB. The cap keeps a
// mis-picked file (a saved web page with inlined images) out of the
// localStorage draft, which shares a ~5MB quota with every other draft.
export const MAX_HTML_UPLOAD_BYTES = 1024 * 1024;

const HTML_FILE_PATTERN = /\.html?$/i;

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export default function EmailHtmlEditor({ value, onChange, hint }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;

    if (!HTML_FILE_PATTERN.test(file.name)) {
      toast({ variant: "destructive", description: "Please choose a .html or .htm file." });
      return;
    }
    if (file.size > MAX_HTML_UPLOAD_BYTES) {
      toast({
        variant: "destructive",
        description: "That file is over 1MB. Host images online and link to them rather than embedding them.",
      });
      return;
    }

    let html: string;
    try {
      html = await readAsText(file);
    } catch {
      toast({ variant: "destructive", description: "Couldn't read that file. Please try again." });
      return;
    }
    if (!html.trim()) {
      toast({ variant: "destructive", description: "That file is empty." });
      return;
    }
    if (
      value.trim() &&
      !window.confirm("Replace the HTML currently in the editor with this file?")
    ) {
      return;
    }

    onChange(html);
    toast({ description: `Loaded ${file.name}` });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">Paste HTML below, or upload a file.</p>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          iconLeft={<Upload className="h-3.5 w-3.5" />}
          onClick={() => fileInputRef.current?.click()}
        >
          Upload .html file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm,text/html"
          className="hidden"
          data-testid="html-file-input"
          onChange={handleFile}
        />
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste your HTML here..."
        className="min-h-[400px] w-full rounded-md border border-border bg-surface/50 px-4 py-3 font-mono text-sm"
      />
      {hint ?? (
        <p className="text-xs text-muted">
          Paste raw HTML from Zoho or other email builders. Placeholders like{" "}
          <code className="rounded bg-surface px-1 py-0.5 text-xs">
            {"{{parentName}}"}
          </code>{" "}
          will be replaced at send time.
        </p>
      )}
    </div>
  );
}
