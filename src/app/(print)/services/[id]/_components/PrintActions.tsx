"use client";

import { Printer } from "lucide-react";

/**
 * Screen-only toolbar for print pages — gives the coordinator a one-click
 * "Print this page" button that triggers the browser's native print dialog.
 *
 * Tagged `no-print` (a class understood by global print.css) so the button
 * itself is hidden when printing.
 */
export function PrintActions() {
  return (
    <div className="no-print flex items-center gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-md bg-[#004E64] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#003a4a] transition-colors"
      >
        <Printer className="h-4 w-4" />
        Print
      </button>
      <button
        type="button"
        onClick={() => window.close()}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        Close
      </button>
    </div>
  );
}
