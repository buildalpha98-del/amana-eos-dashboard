/**
 * Parse VAPI call transcripts and messages to extract structured call data.
 *
 * Three extraction strategies in priority order:
 * 1. Vapi's post-call `analysis.structuredData` (most reliable — runs after hangup)
 * 2. In-transcript markers like ENQUIRY_CAPTURED:{...} (legacy fallback)
 * 3. Default to general_message when neither is available
 */

const MARKER_MAP: Record<string, string> = {
  ENQUIRY_CAPTURED: "new_enquiry",
  BOOKING_CHANGE: "booking_change",
  BILLING_ISSUE: "billing_issue",
  ESCALATION: "escalation",
  HOLIDAY_QUEST_ENQUIRY: "holiday_quest",
  GENERAL_MESSAGE: "general_message",
};

const VALID_CALL_TYPES = new Set(Object.values(MARKER_MAP));

const MARKERS = Object.keys(MARKER_MAP);

export interface ParsedCallData {
  callType: string;
  urgency: string;
  callDetails: Record<string, unknown>;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  childName?: string;
  centreName?: string;
}

/**
 * Extract the JSON object that follows a marker, handling multi-line JSON
 * by counting braces to find the matching closing brace.
 */
function extractJsonAfterMarker(text: string, markerIndex: number, markerLength: number): Record<string, unknown> | null {
  const jsonStart = text.indexOf("{", markerIndex + markerLength);
  if (jsonStart === -1) return null;

  let depth = 0;
  for (let i = jsonStart; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") depth--;
    if (depth === 0) {
      try {
        return JSON.parse(text.slice(jsonStart, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Search a text block for any recognised marker and extract the JSON payload.
 */
function findMarkerInText(text: string): { marker: string; json: Record<string, unknown> } | null {
  for (const marker of MARKERS) {
    const pattern = `${marker}:`;
    const idx = text.indexOf(pattern);
    if (idx !== -1) {
      const json = extractJsonAfterMarker(text, idx, pattern.length);
      if (json) return { marker, json };
    }
  }
  return null;
}

/**
 * Extract a field from the parsed JSON, checking multiple common name variants.
 */
function extractField(data: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = data[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return undefined;
}

function applyUrgencyOverrides(callType: string, json: Record<string, unknown>, urgency: string): string {
  if (!["routine", "urgent", "critical"].includes(urgency)) urgency = "routine";

  if (callType === "escalation") {
    const safeguardingHaystack = [
      extractField(json, "concernDetails", "concern", "details", "description"),
      extractField(json, "concernType", "concern_type", "type"),
      extractField(json, "notes"),
    ]
      .filter(Boolean)
      .join(" ")
      .toUpperCase();
    if (safeguardingHaystack.includes("SAFEGUARDING")) {
      urgency = "critical";
    }
  }

  return urgency;
}

function buildResult(callType: string, json: Record<string, unknown>): ParsedCallData {
  let urgency = extractField(json, "urgency") ?? "routine";
  urgency = applyUrgencyOverrides(callType, json, urgency);

  return {
    callType,
    urgency,
    callDetails: json,
    parentName: extractField(json, "parentName", "callerName", "name", "parent_name"),
    parentPhone: extractField(json, "parentPhone", "phone", "phoneNumber", "phone_number", "contactNumber"),
    parentEmail: extractField(json, "parentEmail", "email", "emailAddress", "parent_email"),
    childName: extractField(json, "childName", "child_name", "childFullName"),
    centreName: extractField(json, "centreName", "schoolName", "centre_name", "school_name", "centre", "school", "preferredLocation"),
  };
}

/**
 * Parse structured data from Vapi's post-call analysis (analysisPlan.structuredData).
 * This is the preferred extraction method — it runs server-side after the call ends,
 * so it works even if the caller hangs up early.
 */
export function parseFromStructuredData(data: Record<string, unknown>): ParsedCallData | null {
  const rawType = extractField(data, "callType", "call_type", "pathway");
  if (!rawType) return null;

  const callType = VALID_CALL_TYPES.has(rawType) ? rawType : "general_message";
  return buildResult(callType, data);
}

/**
 * Parse call data from transcript markers (legacy approach).
 * Searches for ENQUIRY_CAPTURED:{...} etc. in the transcript text or messages array.
 */
export function parseFromTranscript(
  transcript: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[],
): ParsedCallData | null {
  let found = findMarkerInText(transcript);

  if (!found && Array.isArray(messages)) {
    for (const msg of messages) {
      const content = typeof msg === "string" ? msg : msg?.content ?? msg?.text ?? "";
      if (typeof content === "string") {
        found = findMarkerInText(content);
        if (found) break;
      }
    }
  }

  if (!found) return null;

  const { marker, json } = found;
  const callType = MARKER_MAP[marker];
  return buildResult(callType, json);
}

/**
 * Main entry point — tries structured data first, then transcript markers, then defaults.
 */
export function parseCallData(
  transcript: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[],
  structuredData?: Record<string, unknown>,
): ParsedCallData {
  // Strategy 1: Vapi's post-call structured data analysis (most reliable)
  if (structuredData && Object.keys(structuredData).length > 0) {
    const result = parseFromStructuredData(structuredData);
    if (result) return result;
  }

  // Strategy 2: In-transcript markers (legacy fallback)
  const markerResult = parseFromTranscript(transcript, messages);
  if (markerResult) return markerResult;

  // Strategy 3: Default
  return {
    callType: "general_message",
    urgency: "routine",
    callDetails: {},
  };
}
