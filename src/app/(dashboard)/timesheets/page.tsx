"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  useTimesheets,
  useTimesheet,
  useCreateTimesheet,
  useImportTimesheet,
  useSubmitTimesheet,
  useApproveTimesheet,
  useRejectTimesheet,
  useExportTimesheetToXero,
  useDeleteTimesheet,
  useAddTimesheetEntry,
  useTimesheetsSummary,
  type TimesheetData,
  type TimesheetEntryData,
} from "@/hooks/useTimesheets";
import {
  Clock,
  Plus,
  Upload,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Send,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Trash2,
  X,
  AlertCircle,
  Users,
  FileUp,
  Calendar,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
/* xlsx (~800KB) is dynamically imported at point of use in parseFile() */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

interface ParsedEntry {
  staffName: string;
  staffEmail: string;
  email: string;
  date: string;
  shiftStart: string;
  shiftEnd: string;
  breakMins: number;
  breakMinutes: number;
  shiftType: string;
  notes: string;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; dot: string }
> = {
  ts_draft: {
    label: "Draft",
    color: "text-gray-700",
    bg: "bg-gray-100",
    dot: "bg-gray-400",
  },
  submitted: {
    label: "Submitted",
    color: "text-blue-700",
    bg: "bg-blue-100",
    dot: "bg-blue-400",
  },
  approved: {
    label: "Approved",
    color: "text-emerald-700",
    bg: "bg-emerald-100",
    dot: "bg-emerald-400",
  },
  exported_to_xero: {
    label: "Exported to Xero",
    color: "text-purple-700",
    bg: "bg-purple-100",
    dot: "bg-purple-400",
  },
  rejected: {
    label: "Rejected",
    color: "text-red-700",
    bg: "bg-red-100",
    dot: "bg-red-400",
  },
};

const SHIFT_TYPE_MAP: Record<string, string> = {
  BSC: "shift_bsc",
  ASC: "shift_asc",
  VAC: "shift_vac",
  PD: "pd",
  shift_bsc: "shift_bsc",
  shift_asc: "shift_asc",
  shift_vac: "shift_vac",
  pd: "pd",
};

const SHIFT_TYPE_LABELS: Record<string, string> = {
  shift_bsc: "BSC",
  shift_asc: "ASC",
  shift_vac: "VAC",
  pd: "PD",
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatTime(timeStr: string): string {
  if (!timeStr) return "";
  // Handle HH:mm or HH:mm:ss
  const parts = timeStr.split(":");
  const h = parseInt(parts[0], 10);
  const m = parts[1] || "00";
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatHours(hours: number): string {
  return hours.toFixed(1);
}

function getWeekLabel(weekEnding: string): string {
  const end = new Date(weekEnding);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return `${formatDateShort(start.toISOString())} - ${formatDateShort(end.toISOString())}`;
}

/* ------------------------------------------------------------------ */
/* StatusBadge                                                         */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.ts_draft;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        cfg.bg,
        cfg.color
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* StatCard                                                            */
/* ------------------------------------------------------------------ */

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: color + "15", color }}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AddEntryModal                                                       */
/* ------------------------------------------------------------------ */

function AddEntryModal({
  timesheetId,
  onClose,
}: {
  timesheetId: string;
  onClose: () => void;
}) {
  const addEntry = useAddTimesheetEntry();
  const { data: users } = useQuery<{ id: string; name: string; email: string }[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [form, setForm] = useState({
    userId: "",
    date: "",
    shiftStart: "",
    shiftEnd: "",
    breakMinutes: 0,
    shiftType: "shift_bsc",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addEntry.mutateAsync({
      timesheetId,
      entries: [{
        userId: form.userId,
        date: form.date,
        shiftStart: form.shiftStart,
        shiftEnd: form.shiftEnd,
        breakMinutes: Number(form.breakMinutes),
        shiftType: form.shiftType,
        notes: form.notes || undefined,
      }],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Add Entry</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Staff Member *
            </label>
            <select
              required
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="">Select staff...</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Shift Type *
              </label>
              <select
                value={form.shiftType}
                onChange={(e) => setForm({ ...form, shiftType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                <option value="shift_bsc">BSC</option>
                <option value="shift_asc">ASC</option>
                <option value="shift_vac">VAC</option>
                <option value="pd">PD</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start *
              </label>
              <input
                type="time"
                required
                value={form.shiftStart}
                onChange={(e) =>
                  setForm({ ...form, shiftStart: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End *
              </label>
              <input
                type="time"
                required
                value={form.shiftEnd}
                onChange={(e) => setForm({ ...form, shiftEnd: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Break (mins)
              </label>
              <input
                type="number"
                min={0}
                value={form.breakMinutes}
                onChange={(e) =>
                  setForm({ ...form, breakMinutes: Number(e.target.value) })
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addEntry.isPending || !form.userId}
              className="px-4 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
            >
              {addEntry.isPending ? "Adding..." : "Add Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* NewTimesheetModal                                                    */
/* ------------------------------------------------------------------ */

function NewTimesheetModal({
  services,
  onClose,
}: {
  services: ServiceOption[];
  onClose: () => void;
}) {
  const createTimesheet = useCreateTimesheet();
  const [serviceId, setServiceId] = useState("");
  const [weekEnding, setWeekEnding] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createTimesheet.mutateAsync({ serviceId, weekEnding });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            New Timesheet
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Service *
            </label>
            <select
              required
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="">Select a service...</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Week Ending (Sunday) *
            </label>
            <input
              type="date"
              required
              value={weekEnding}
              onChange={(e) => setWeekEnding(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTimesheet.isPending || !serviceId || !weekEnding}
              className="px-4 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
            >
              {createTimesheet.isPending ? "Creating..." : "Create Timesheet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ImportFromOWNAModal                                                 */
/* ------------------------------------------------------------------ */

function ImportFromOWNAModal({
  services,
  onClose,
}: {
  services: ServiceOption[];
  onClose: () => void;
}) {
  const importTimesheet = useImportTimesheet();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [serviceId, setServiceId] = useState("");
  const [weekEnding, setWeekEnding] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsedEntries, setParsedEntries] = useState<ParsedEntry[]>([]);
  const [parseError, setParseError] = useState("");
  const [importResult, setImportResult] = useState<{
    matched: string[] | number;
    unmatched: string[] | number;
    entriesCreated: number;
    unmatchedNames?: string[];
    timesheetId?: string;
  } | null>(null);
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");

  const parseFile = useCallback((file: File) => {
    setParseError("");
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import("xlsx");
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
          defval: "",
        });

        if (json.length === 0) {
          setParseError("No data rows found in the file.");
          return;
        }

        // Attempt column detection
        const headers = Object.keys(json[0]);
        const findCol = (candidates: string[]) =>
          headers.find((h) =>
            candidates.some((c) => h.toLowerCase().includes(c.toLowerCase()))
          );

        const staffNameCol =
          findCol(["Staff Name", "Name", "Employee", "FullName", "Full Name"]) ||
          headers[0];
        const staffEmailCol = findCol([
          "Staff Email",
          "Email",
          "EmailAddress",
        ]);
        const dateCol =
          findCol(["Date", "Shift Date", "WorkDate"]) || headers[1];
        const startCol =
          findCol(["Shift Start", "Start", "Start Time", "TimeIn"]) ||
          headers[2];
        const endCol =
          findCol(["Shift End", "End", "End Time", "TimeOut", "Finish"]) ||
          headers[3];
        const breakCol = findCol([
          "Break",
          "Break (mins)",
          "BreakMins",
          "Break Minutes",
        ]);
        const typeCol = findCol([
          "Shift Type",
          "Type",
          "ShiftType",
          "Category",
        ]);

        const entries: ParsedEntry[] = json.map((row) => {
          const rawType = typeCol ? String(row[typeCol] || "").trim() : "";
          const mappedType =
            SHIFT_TYPE_MAP[rawType] ||
            SHIFT_TYPE_MAP[rawType.toUpperCase()] ||
            "shift_bsc";

          // Handle Excel serial dates
          let dateStr = "";
          const rawDate = row[dateCol];
          if (typeof rawDate === "number") {
            const excelDate = XLSX.SSF.parse_date_code(rawDate);
            dateStr = `${excelDate.y}-${String(excelDate.m).padStart(2, "0")}-${String(excelDate.d).padStart(2, "0")}`;
          } else {
            const d = new Date(String(rawDate));
            if (!isNaN(d.getTime())) {
              dateStr = d.toISOString().split("T")[0];
            } else {
              dateStr = String(rawDate);
            }
          }

          // Handle time values
          const parseTime = (val: any): string => {
            if (typeof val === "number") {
              // Excel serial time
              const totalMins = Math.round(val * 24 * 60);
              const hh = Math.floor(totalMins / 60);
              const mm = totalMins % 60;
              return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
            }
            const s = String(val || "").trim();
            // already HH:mm
            if (/^\d{1,2}:\d{2}/.test(s)) return s.substring(0, 5);
            return s;
          };

          const staffEmail = staffEmailCol
              ? String(row[staffEmailCol] || "").trim()
              : "";
          const breakMins = breakCol ? Number(row[breakCol]) || 0 : 0;
          return {
            staffName: String(row[staffNameCol] || "").trim(),
            staffEmail,
            email: staffEmail,
            date: dateStr,
            shiftStart: parseTime(row[startCol]),
            shiftEnd: parseTime(row[endCol]),
            breakMins,
            breakMinutes: breakMins,
            shiftType: mappedType,
            notes: "",
          };
        });

        // Filter empty rows
        const validEntries = entries.filter(
          (e) => e.staffName && e.date && e.shiftStart && e.shiftEnd
        );

        if (validEntries.length === 0) {
          setParseError(
            "Could not parse any valid entries. Check that columns include Staff Name, Date, Shift Start, and Shift End."
          );
          return;
        }

        setParsedEntries(validEntries);
        setStep("preview");
      } catch (err: any) {
        setParseError(err.message || "Failed to parse file");
      }
    };
    reader.readAsBinaryString(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) parseFile(file);
    },
    [parseFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) parseFile(file);
    },
    [parseFile]
  );

  const handleImport = async () => {
    try {
      const result = await importTimesheet.mutateAsync({
        serviceId,
        weekEnding,
        entries: parsedEntries,
      });
      setImportResult(result);
      setStep("result");
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Import from OWNA
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === "upload" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service *
              </label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                <option value="">Select a service...</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Week Ending (Sunday) *
              </label>
              <input
                type="date"
                value={weekEnding}
                onChange={(e) => setWeekEnding(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>

            {/* File Upload Area */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                dragOver
                  ? "border-brand bg-brand/5"
                  : "border-gray-300 hover:border-gray-400"
              )}
            >
              <FileUp className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">
                {fileName || "Drop your OWNA export file here"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Accepts .csv and .xlsx files
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {parseError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{parseError}</p>
              </div>
            )}
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">
                  {parsedEntries.length}
                </span>{" "}
                entries parsed from{" "}
                <span className="font-medium">{fileName}</span>
              </p>
              <button
                onClick={() => {
                  setStep("upload");
                  setParsedEntries([]);
                  setFileName("");
                }}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Re-upload
              </button>
            </div>

            {/* Preview Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-surface sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">
                        Staff
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">
                        Date
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">
                        Shift
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">
                        Break
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">
                        Type
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsedEntries.slice(0, 50).map((entry, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-900 font-medium whitespace-nowrap">
                          {entry.staffName}
                        </td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {entry.date}
                        </td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {entry.shiftStart} - {entry.shiftEnd}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {entry.breakMins}m
                        </td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-medium">
                            {SHIFT_TYPE_LABELS[entry.shiftType] ||
                              entry.shiftType}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedEntries.length > 50 && (
                <div className="px-3 py-2 bg-gray-50 text-xs text-gray-500 text-center border-t">
                  Showing first 50 of {parsedEntries.length} entries
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={
                  importTimesheet.isPending || !serviceId || !weekEnding
                }
                className="px-4 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
              >
                {importTimesheet.isPending
                  ? "Importing..."
                  : `Import ${parsedEntries.length} Entries`}
              </button>
            </div>

            {importTimesheet.isError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">
                  {importTimesheet.error?.message || "Import failed"}
                </p>
              </div>
            )}
          </div>
        )}

        {step === "result" && importResult && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800">
                  Import Complete
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-3">
                <div>
                  <p className="text-2xl font-bold text-emerald-700">
                    {importResult.entriesCreated}
                  </p>
                  <p className="text-xs text-emerald-600">Entries Created</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-700">
                    {Array.isArray(importResult.matched) ? importResult.matched.length : importResult.matched}
                  </p>
                  <p className="text-xs text-emerald-600">Staff Matched</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600">
                    {Array.isArray(importResult.unmatched) ? importResult.unmatched.length : importResult.unmatched}
                  </p>
                  <p className="text-xs text-amber-600">Unmatched</p>
                </div>
              </div>
            </div>

            {((importResult.unmatchedNames && importResult.unmatchedNames.length > 0) ||
              (Array.isArray(importResult.unmatched) && importResult.unmatched.length > 0)) && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs font-medium text-amber-800 mb-1">
                    Unmatched staff:
                  </p>
                  <p className="text-xs text-amber-700">
                    {(importResult.unmatchedNames || (Array.isArray(importResult.unmatched) ? importResult.unmatched : []) as string[]).join(", ")}
                  </p>
                </div>
              )}

            <div className="flex justify-end pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TimesheetDetail                                                     */
/* ------------------------------------------------------------------ */

function TimesheetDetail({
  timesheetId,
  onClose,
}: {
  timesheetId: string;
  onClose: () => void;
}) {
  const { data: ts, isLoading } = useTimesheet(timesheetId);
  const submitTimesheet = useSubmitTimesheet();
  const approveTimesheet = useApproveTimesheet();
  const rejectTimesheet = useRejectTimesheet();
  const exportToXero = useExportTimesheetToXero();
  const deleteTimesheet = useDeleteTimesheet();
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (isLoading || !ts) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 mt-2">
        <div className="flex items-center justify-center py-12">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-brand rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const entries = ts.entries || [];
  const status = ts.status;

  const handleSubmit = async () => {
    await submitTimesheet.mutateAsync(timesheetId);
  };

  const handleApprove = async () => {
    await approveTimesheet.mutateAsync(timesheetId);
  };

  const handleReject = async () => {
    await rejectTimesheet.mutateAsync({ id: timesheetId, reason: rejectReason });
    setShowRejectForm(false);
    setRejectReason("");
  };

  const handleExportXero = async () => {
    await exportToXero.mutateAsync(timesheetId);
  };

  const handleDelete = async () => {
    await deleteTimesheet.mutateAsync(timesheetId);
    setShowDeleteConfirm(false);
    onClose();
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mt-2 animate-in slide-in-from-top-2 duration-200">
      {/* Detail Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h4 className="text-base font-semibold text-gray-900">
              {ts.service?.name} &mdash; Week ending{" "}
              {formatDate(ts.weekEnding)}
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">
              {entries.length} entries &middot; {formatHours(entries.reduce((sum: number, e: any) => sum + (e.totalHours || 0), 0))} hrs
              total
            </p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Entries Table */}
      {entries.length > 0 ? (
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500 text-xs">
                    Staff Name
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500 text-xs">
                    Date
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500 text-xs">
                    Shift
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500 text-xs">
                    Break
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500 text-xs">
                    Hours
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500 text-xs">
                    Type
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500 text-xs">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-gray-900 font-medium whitespace-nowrap">
                      {entry.user?.name || "Unknown"}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                      {formatDate(entry.date)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                      {formatTime(entry.shiftStart)} -{" "}
                      {formatTime(entry.shiftEnd)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {entry.breakMinutes}m
                    </td>
                    <td className="px-3 py-2.5 text-gray-900 font-medium">
                      {formatHours(entry.totalHours)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-medium">
                        {SHIFT_TYPE_LABELS[entry.shiftType] || entry.shiftType}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs max-w-[200px] truncate">
                      {entry.notes || "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState icon={FileSpreadsheet} title="No Entries Yet" description="This timesheet has no entries. Add entries manually or import from OWNA." variant="inline" />
      )}

      {/* Reject Form */}
      {showRejectForm && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <label className="block text-sm font-medium text-red-800 mb-1">
            Rejection Reason (optional)
          </label>
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Enter reason for rejection..."
            className="w-full px-3 py-2 text-sm border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleReject}
              disabled={rejectTimesheet.isPending}
              className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {rejectTimesheet.isPending ? "Rejecting..." : "Confirm Reject"}
            </button>
            <button
              onClick={() => setShowRejectForm(false)}
              className="px-3 py-1.5 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Draft: Add Entry, Submit, Delete */}
        {status === "ts_draft" && (
          <>
            <button
              onClick={() => setShowAddEntry(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Entry
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitTimesheet.isPending || entries.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {submitTimesheet.isPending ? "Submitting..." : "Submit"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteTimesheet.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </>
        )}

        {/* Submitted: Approve, Reject */}
        {status === "submitted" && (
          <>
            <button
              onClick={handleApprove}
              disabled={approveTimesheet.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {approveTimesheet.isPending ? "Approving..." : "Approve"}
            </button>
            <button
              onClick={() => setShowRejectForm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
          </>
        )}

        {/* Approved: Export to Xero */}
        {status === "approved" && (
          <button
            onClick={handleExportXero}
            disabled={exportToXero.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            <ExternalLink className="w-4 h-4" />
            {exportToXero.isPending ? "Exporting..." : "Export to Xero"}
          </button>
        )}

        {/* Exported: Done state */}
        {status === "exported_to_xero" && (
          <p className="text-sm text-purple-600 font-medium">
            Exported to Xero on {ts.exportedAt ? formatDate(ts.exportedAt) : "N/A"}
          </p>
        )}

        {/* Rejected: Re-edit (set back to draft) */}
        {status === "rejected" && (
          <>
            <button
              onClick={() => setShowAddEntry(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Entry
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitTimesheet.isPending || entries.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {submitTimesheet.isPending ? "Re-submitting..." : "Re-submit"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteTimesheet.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </>
        )}
      </div>

      {/* Add Entry Modal */}
      {showAddEntry && (
        <AddEntryModal
          timesheetId={timesheetId}
          onClose={() => setShowAddEntry(false)}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Timesheet"
        description="Are you sure you want to delete this timesheet? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        loading={deleteTimesheet.isPending}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function TimesheetsPage() {
  const { data: session } = useSession();
  const role = (session?.user?.role as string) || "";
  const isAdmin = role === "owner" || role === "admin";

  // Filters
  const [filterService, setFilterService] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch services for dropdowns
  const { data: services } = useQuery<ServiceOption[]>({
    queryKey: ["services-list"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((s: any) => ({ id: s.id, name: s.name, code: s.code }));
    },
  });

  // Build filters
  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (filterService) f.serviceId = filterService;
    if (filterStatus) f.status = filterStatus;
    if (filterFrom) f.weekEndingAfter = filterFrom;
    if (filterTo) f.weekEndingBefore = filterTo;
    return Object.keys(f).length > 0 ? f : undefined;
  }, [filterService, filterStatus, filterFrom, filterTo]);

  const { data: timesheets, isLoading, error, refetch } = useTimesheets(filters as any);
  const { data: summaryData } = useTimesheetsSummary(
    filterService || undefined,
    filterFrom || undefined,
    filterTo || undefined
  );

  // Compute summary stats: prefer the summary API when available, fall back to timesheets list
  const summary = useMemo(() => {
    if (summaryData) {
      return {
        totalHours: summaryData.reduce((s, e) => s + e.totalHours, 0),
        staffCount: summaryData.length,
        pendingApproval: timesheets?.filter((t) => t.status === "submitted").length ?? 0,
        exportedToXero: timesheets?.filter((t) => t.status === "exported_to_xero").length ?? 0,
      };
    }
    if (!timesheets) return { totalHours: 0, pendingApproval: 0, exportedToXero: 0, staffCount: 0 };
    const pendingApproval = timesheets.filter((t) => t.status === "submitted").length;
    const exportedToXero = timesheets.filter((t) => t.status === "exported_to_xero").length;
    // Derive unique staff from entries when available
    const staffIds = new Set<string>();
    timesheets.forEach((ts) => {
      ts.entries?.forEach((e) => { if (e.userId) staffIds.add(e.userId); });
    });
    const totalHours = timesheets.reduce((sum, ts) => {
      const hrs = ts.entries
        ? ts.entries.reduce((s, e) => s + (e.totalHours || 0), 0)
        : 0;
      return sum + hrs;
    }, 0);
    return { totalHours, pendingApproval, exportedToXero, staffCount: staffIds.size };
  }, [summaryData, timesheets]);

  const hasActiveFilters = filterService || filterStatus || filterFrom || filterTo;

  // Group timesheets by week
  const groupedByWeek = useMemo(() => {
    if (!timesheets) return [];
    const map = new Map<string, TimesheetData[]>();
    for (const ts of timesheets) {
      const key = ts.weekEnding;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ts);
    }
    // Sort weeks descending
    return Array.from(map.entries()).sort(
      (a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()
    );
  }, [timesheets]);

  // Access check
  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            Access Restricted
          </h3>
          <p className="text-gray-500 mt-2 max-w-md">
            Timesheets are only accessible to Owners and Admins.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Timesheets</h2>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
            Manage staff timesheets, import from OWNA, and export to Xero
          </p>
        </div>
        <ErrorState
          title="Failed to load timesheets"
          error={error as Error}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Timesheets</h2>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
            Manage staff timesheets, import from OWNA, and export to Xero
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "p-2 rounded-lg border transition-colors",
              hasActiveFilters
                ? "border-brand bg-brand/5 text-brand"
                : "border-gray-200 text-gray-400 hover:text-gray-600"
            )}
            title="Filters"
          >
            <Filter className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import from OWNA
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Timesheet
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className="mb-4 flex flex-wrap items-end gap-3 p-4 bg-white rounded-xl border border-gray-200">
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Service
            </label>
            <select
              value={filterService}
              onChange={(e) => setFilterService(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="">All Services</option>
              {services?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="">All Statuses</option>
              <option value="ts_draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="exported_to_xero">Exported to Xero</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              From
            </label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              To
            </label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          {hasActiveFilters && (
            <button
              onClick={() => {
                setFilterService("");
                setFilterStatus("");
                setFilterFrom("");
                setFilterTo("");
              }}
              className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Hours This Period"
          value={formatHours(summary.totalHours)}
          icon={Clock}
          color="#004E64"
        />
        <StatCard
          title="Pending Approval"
          value={summary.pendingApproval}
          icon={Send}
          color="#2563eb"
        />
        <StatCard
          title="Exported to Xero"
          value={summary.exportedToXero}
          icon={ExternalLink}
          color="#7c3aed"
        />
        <StatCard
          title="Staff Count"
          value={summary.staffCount}
          icon={Users}
          color="#059669"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      ) : groupedByWeek.length > 0 ? (
        <div className="space-y-6">
          {groupedByWeek.map(([weekEnding, weekTimesheets]) => (
            <div key={weekEnding}>
              {/* Week Header */}
              <div className="flex items-center gap-3 mb-3">
                <Calendar className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-700">
                  Week ending {formatDate(weekEnding)}
                </h3>
                <span className="text-xs text-gray-400">
                  {getWeekLabel(weekEnding)}
                </span>
              </div>

              {/* Timesheet Cards */}
              <div className="space-y-2">
                {weekTimesheets.map((ts) => (
                  <div key={ts.id}>
                    <button
                      onClick={() =>
                        setExpandedId(
                          expandedId === ts.id ? null : ts.id
                        )
                      }
                      className={cn(
                        "w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-gray-300 transition-all",
                        expandedId === ts.id && "border-brand/30 ring-1 ring-brand/10"
                      )}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {expandedId === ts.id ? (
                            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {ts.service?.name || "Unknown Service"}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {ts.service?.code}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-bold text-gray-900">
                              {ts._count?.entries ?? 0} entries
                            </p>
                          </div>
                          <StatusBadge status={ts.status} />
                        </div>
                      </div>
                    </button>

                    {/* Expanded Detail */}
                    {expandedId === ts.id && (
                      <TimesheetDetail
                        timesheetId={ts.id}
                        onClose={() => setExpandedId(null)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <EmptyState
          icon={FileSpreadsheet}
          title="No Timesheets Yet"
          description="Import staff timesheets from OWNA or create a new timesheet to get started."
          action={{ label: "New Timesheet", icon: Plus, onClick: () => setShowCreate(true) }}
        />
      )}

      {/* Modals */}
      {showImport && services && (
        <ImportFromOWNAModal
          services={services}
          onClose={() => setShowImport(false)}
        />
      )}

      {showCreate && services && (
        <NewTimesheetModal
          services={services}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
