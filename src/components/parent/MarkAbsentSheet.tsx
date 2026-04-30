"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, FileText, Loader2, Paperclip, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useMarkAbsent, type BookingRecord } from "@/hooks/useParentPortal";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

const NOTES_LIMIT = 500;
const UPLOAD_ENDPOINT = "/api/parent/upload/absence-cert";

interface Props {
  booking: BookingRecord | null;
  onClose: () => void;
}

export function MarkAbsentSheet({ booking, onClose }: Props) {
  const open = booking !== null;
  const markAbsent = useMarkAbsent();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isIllness, setIsIllness] = useState(false);
  const [notes, setNotes] = useState("");
  const [certUrl, setCertUrl] = useState<string | null>(null);
  const [certPreview, setCertPreview] = useState<string | null>(null);
  const [certName, setCertName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Reset form each time the sheet re-opens on a new booking.
  useEffect(() => {
    if (open) {
      setIsIllness(false);
      setNotes("");
      setCertUrl(null);
      setCertPreview(null);
      setCertName(null);
      setUploading(false);
    }
  }, [open, booking?.id]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-selecting same file

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(UPLOAD_ENDPOINT, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed");
      }
      const { url } = (await res.json()) as { url: string };
      setCertUrl(url);
      setCertName(file.name);
      if (file.type.startsWith("image/")) {
        setCertPreview(URL.createObjectURL(file));
      } else {
        setCertPreview(null);
      }
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setUploading(false);
    }
  };

  const removeCert = () => {
    if (certPreview) URL.revokeObjectURL(certPreview);
    setCertUrl(null);
    setCertPreview(null);
    setCertName(null);
  };

  const handleSubmit = () => {
    if (!booking) return;
    markAbsent.mutate(
      {
        bookingId: booking.id,
        isIllness,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(certUrl ? { medicalCertificateUrl: certUrl } : {}),
      },
      { onSuccess: () => onClose() },
    );
  };

  const submitDisabled = markAbsent.isPending || uploading || !booking;
  const overLimit = notes.length > NOTES_LIMIT;

  return (
    <BottomSheet open={open} onClose={onClose} title="Mark as Absent">
      <div className="px-3 pb-2 space-y-5">
        {booking && (
          <p className="text-sm text-[#7c7c8a]">
            {booking.child.firstName}&apos;s {booking.sessionType.toUpperCase()} session
          </p>
        )}

        {/* Illness toggle */}
        <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-[#1a1a2e]">Due to illness</p>
            <p className="text-xs text-[#7c7c8a]">
              Tick if your child is sick today.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isIllness}
            aria-label="Due to illness"
            onClick={() => setIsIllness((v) => !v)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              isIllness ? "bg-[#004E64]" : "bg-[#e8e4df]",
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform",
                isIllness ? "translate-x-5" : "translate-x-0.5",
              )}
            />
          </button>
        </label>

        {/* Notes */}
        <div>
          <label htmlFor="absence-notes" className="block text-xs font-medium text-[#1a1a2e]/70 mb-1.5">
            Notes <span className="text-[#7c7c8a] font-normal">(optional)</span>
          </label>
          <textarea
            id="absence-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, NOTES_LIMIT))}
            rows={3}
            placeholder="Anything the centre should know…"
            className="w-full px-3 py-2 text-sm border border-[#e8e4df] rounded-xl bg-white resize-none focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]"
          />
          <p className={cn(
            "text-right text-[11px] mt-1",
            overLimit ? "text-red-600" : "text-[#7c7c8a]",
          )}>
            {notes.length}/{NOTES_LIMIT}
          </p>
        </div>

        {/* Medical certificate upload */}
        <div>
          <p className="text-xs font-medium text-[#1a1a2e]/70 mb-1.5">
            Medical certificate <span className="text-[#7c7c8a] font-normal">(optional)</span>
          </p>

          {!certUrl ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-dashed border-[#e8e4df] rounded-xl text-sm font-medium text-[#004E64] hover:bg-[#F2EDE8] transition-colors disabled:opacity-50 min-h-[48px]"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Paperclip className="w-4 h-4" />
                  Attach certificate (PDF or image)
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-[#e8e4df] bg-white">
              {certPreview ? (
                <img
                  src={certPreview}
                  alt="Certificate preview"
                  className="w-12 h-12 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-[#F2EDE8] flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-[#004E64]" />
                </div>
              )}
              <p className="flex-1 text-sm text-[#1a1a2e] truncate">
                {certName || "Certificate attached"}
              </p>
              <button
                type="button"
                onClick={removeCert}
                aria-label="Remove certificate"
                className="p-2 rounded-lg text-[#7c7c8a] hover:text-[#1a1a2e] hover:bg-[#F2EDE8] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {overLimit && (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <AlertCircle className="w-3.5 h-3.5" />
            Notes must be {NOTES_LIMIT} characters or fewer.
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitDisabled || overLimit}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
        >
          {markAbsent.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting…
            </>
          ) : (
            "Submit absence"
          )}
        </button>
      </div>
    </BottomSheet>
  );
}
