"use client";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function EmailHtmlEditor({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste your HTML here..."
        className="min-h-[400px] w-full rounded-md border border-border bg-gray-50 px-4 py-3 font-mono text-sm"
      />
      <p className="text-xs text-muted">
        Paste raw HTML from Zoho or other email builders. Placeholders like{" "}
        <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
          {"{{parentName}}"}
        </code>{" "}
        will be replaced at send time.
      </p>
    </div>
  );
}
