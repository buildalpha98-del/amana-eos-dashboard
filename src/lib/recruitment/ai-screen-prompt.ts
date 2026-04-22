export interface AiScreenInputs {
  candidateName: string;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  resumeText: string;
  vacancyRole: string;
  employmentType: string;
  qualificationRequired?: string | null;
}

export interface AiScreenResult {
  score: number;
  summary: string;
}

export function buildScreenPrompt(inputs: AiScreenInputs): string {
  return `You are an HR screening assistant for Amana OSHC (Out of School Hours Care in Australia). Assess candidate fit for an OSHC educator vacancy.

VACANCY:
- Role: ${inputs.vacancyRole}
- Employment Type: ${inputs.employmentType}
- Qualification Required: ${inputs.qualificationRequired ?? "None specified"}

CANDIDATE:
- Name: ${inputs.candidateName}
- Email: ${inputs.candidateEmail ?? "(not provided)"}
- Phone: ${inputs.candidatePhone ?? "(not provided)"}

RESUME / APPLICATION DETAILS:
"""
${inputs.resumeText.trim() || "(no resume text provided)"}
"""

Respond in exactly this JSON shape:
{"score": <integer 0-100>, "summary": "<2-4 sentence summary covering: relevant childcare/education experience, qualifications, strengths, gaps>"}

Do not include any text outside the JSON object.`;
}

export function parseScreenResponse(raw: string): AiScreenResult {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as { score: unknown; summary: unknown };
  const score = Number(parsed.score);
  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error("AI returned invalid score");
  }
  if (!summary.trim()) {
    throw new Error("AI returned empty summary");
  }
  return { score: Math.round(score), summary: summary.trim() };
}
