"use client";

/**
 * SignaturePad — HTML5-canvas signature capture.
 *
 * Used by:
 *   - Contract issue modal (admin signs the contract before sending)
 *   - Contract viewer modal (staff signs to acknowledge)
 *
 * Output is a transparent PNG data URL captured via canvas.toDataURL.
 * Parent controls whether the value is committed (e.g. validates that
 * the canvas isn't empty before enabling the Save button) — the
 * component itself is just the drawing surface + a Clear button.
 *
 * 2026-06-02: introduced for the two-party contract signature flow.
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SignaturePadProps {
  /** Called whenever a stroke ends. Provides the current PNG data URL
   *  if the canvas has any ink, or null if it's been cleared. */
  onChange: (dataUrl: string | null) => void;
  /** Optional initial signature (data URL). Useful for "re-sign"
   *  flows where you want to show what was previously captured. */
  initial?: string | null;
  /** Visual width — canvas resolution is scaled for DPR internally so
   *  the saved PNG is crisp on retina. Default 480 (fits a modal). */
  width?: number;
  /** Visual height. Default 160 — comfortable for a signature line. */
  height?: number;
  /** Optional label rendered above the pad. */
  label?: string;
  /** Disables drawing. Used when the parent is mid-save. */
  disabled?: boolean;
}

export function SignaturePad({
  onChange,
  initial = null,
  width = 480,
  height = 160,
  label,
  disabled = false,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  // We track "is empty" locally so the Clear button can disable
  // when nothing's been drawn. Resets to true after Clear.
  const [isEmpty, setIsEmpty] = useState(!initial);

  // Set up the canvas: scale for DPR so retina screens render
  // crisp strokes. Re-do this whenever the visual size changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";

    // If we have an initial signature, paint it so the user sees what
    // was previously captured. They can still Clear to draw fresh.
    if (initial) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = initial;
    }
  }, [width, height, initial]);

  // Convert a pointer event's client coords into canvas-local coords
  // (the canvas is DPR-scaled but the *CSS* size matches the visual,
  // so getBoundingClientRect gives us the right space).
  const pointerToCanvas = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    [],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawingRef.current = true;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = pointerToCanvas(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { x, y } = pointerToCanvas(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    // Stroke ended → emit the current PNG. We mark "not empty" since
    // we just drew something.
    setIsEmpty(false);
    if (canvas) {
      onChange(canvas.toDataURL("image/png"));
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // Reset transform → fillRect-clear → restore DPR scale so the
    // next stroke is still crisp.
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.scale(dpr, dpr);
    setIsEmpty(true);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">{label}</label>
          <button
            type="button"
            onClick={handleClear}
            disabled={isEmpty || disabled}
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground disabled:opacity-40"
          >
            <Eraser className="w-3 h-3" />
            Clear
          </button>
        </div>
      )}
      <div
        className={cn(
          "rounded-lg border border-border bg-white overflow-hidden touch-none",
          // Touch-action none — Safari otherwise scrolls the page when
          // a user tries to draw on touch.
          disabled && "opacity-60",
        )}
        style={{ width, maxWidth: "100%" }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          className="block cursor-crosshair"
          aria-label="Signature pad — sign here"
        />
      </div>
      <p className="text-xs text-muted">
        Sign above with your mouse or finger. Use the Clear button to
        restart.
      </p>
      {!label && (
        <button
          type="button"
          onClick={handleClear}
          disabled={isEmpty || disabled}
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground disabled:opacity-40"
        >
          <Eraser className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  );
}
