/**
 * Parse VAPI call transcripts and messages to extract structured call data.
 *
 * The VAPI assistant embeds markers like ENQUIRY_CAPTURED:{...} in the transcript.
 * This parser extracts those markers and maps them to our internal call types.
 */

const MARKER_MAP: Record<string, string> = {
  ENQUIRY_CAPTURED: "new_enquiry",
  BOOKING_CHANGE: "booking_change",
  BILLING_ISSUE: "billing_issue",
  ESCALATION: "escalation",
  HOLIDAY_QUEST_ENQUIRY: "holiday_quest",
  GENERAL_MESSAGE: "general_message",
};

const MARKERS = Object.keys(MARKER_MAP);

interface ParsedCallData {
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

export function parseCallData(
  transcript: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[],
): ParsedCallData {
  // Search transcript first, then individual messages
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

  if (!found) {
    return {
      callType: "general_message",
      urgency: "routine",
      callDetails: {},
    };
  }

  const { marker, json } = found;
  const callType = MARKER_MAP[marker];

  // Determine urgency
  let urgency = extractField(json, "urgency") ?? "routine";
  if (!["routine", "urgent", "critical"].includes(urgency)) urgency = "routine";

  // Override: escalation + safeguarding → critical
  if (callType === "escalation") {
    const concernDetails = extractField(json, "concernDetails", "concern", "details", "description") ?? "";
    if (concernDetails.toUpperCase().includes("SAFEGUARDING")) {
      urgency = "critical";
    }
  }

  return {
    callType,
    urgency,
    callDetails: json,
    parentName: extractField(json, "parentName", "callerName", "name", "parent_name"),
    parentPhone: extractField(json, "parentPhone", "phone", "phoneNumber", "phone_number", "contactNumber"),
    parentEmail: extractField(json, "parentEmail", "email", "emailAddress", "parent_email"),
    childName: extractField(json, "childName", "child_name", "childFullName"),
    centreName: extractField(json, "centreName", "schoolName", "centre_name", "school_name", "centre", "school"),
  };
}
