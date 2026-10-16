import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { generateText } from "@/lib/ai";
import {
  buildScreenPrompt,
  parseScreenResponse,
} from "@/lib/recruitment/ai-screen-prompt";

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;

    const candidate = await prisma.recruitmentCandidate.findUnique({
      where: { id },
      include: {
        vacancy: {
          select: {
            role: true,
            employmentType: true,
            qualificationRequired: true,
            deleted: true,
          },
        },
      },
    });
    if (!candidate) {
      throw ApiError.notFound("Candidate not found");
    }
    if (candidate.vacancy?.deleted) {
      throw ApiError.notFound("Candidate's vacancy has been deleted");
    }
    // 2026-10-16: online applicants rarely have résumé TEXT (uploads are
    // files), so screen their application answers instead of refusing.
    const answers = [
      candidate.qualification && `Highest qualification: ${candidate.qualification}${candidate.qualificationName ? ` (${candidate.qualificationName})` : ""}`,
      candidate.studying && "Currently studying",
      candidate.vicDiplomaLevel != null && `Victorian diploma-level qualification: ${candidate.vicDiplomaLevel ? "yes" : "no"}`,
      candidate.state && `Wants to work in: ${candidate.state}`,
      candidate.wwccNumber ? "Has a Working With Children Check" : null,
      candidate.rightToWork && `Right to work: ${candidate.rightToWork}`,
      candidate.hasFirstAid && "Has a first aid certificate",
      candidate.yearsExperience != null && `Years working with children: ${candidate.yearsExperience}`,
      candidate.previousRole && `Most recent role: ${candidate.previousRole}${candidate.previousEmployer ? ` at ${candidate.previousEmployer}` : ""}`,
      candidate.holidayWeeks != null && `Holiday weeks available: ${candidate.holidayWeeks}`,
      (candidate.availableDays ?? []).length > 0 && `Days available: ${candidate.availableDays.join(", ")}`,
      candidate.notes && `In their words: ${candidate.notes}`,
    ].filter(Boolean).join("\n");
    const screenText = candidate.resumeText?.trim() || answers;
    if (!screenText) {
      throw ApiError.badRequest("This candidate has no résumé text or application answers to screen");
    }

    const prompt = buildScreenPrompt({
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      candidatePhone: candidate.phone,
      resumeText: screenText,
      // 2026-09-15: pool candidates have no vacancy. Screen them against the
      // role the pool actually exists to fill — a casual educator working
      // across centres — rather than refusing to screen at all.
      vacancyRole: candidate.vacancy?.role ?? "educator",
      employmentType: candidate.vacancy?.employmentType ?? "casual",
      qualificationRequired: candidate.vacancy?.qualificationRequired ?? null,
    });

    let result;
    try {
      const raw = await generateText(prompt, {
        maxTokens: 800,
        temperature: 0.2,
      });
      result = parseScreenResponse(raw);
    } catch (err) {
      logger.error("AI screen failed", { candidateId: id, err });
      throw ApiError.badRequest(
        err instanceof Error
          ? `AI screening failed: ${err.message}`
          : "AI screening failed",
      );
    }

    const updated = await prisma.recruitmentCandidate.update({
      where: { id },
      data: {
        aiScreenScore: result.score,
        aiScreenSummary: result.summary,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "ai_screen",
        entityType: "RecruitmentCandidate",
        entityId: id,
        details: { score: result.score },
      },
    });

    return NextResponse.json({
      aiScreenScore: updated.aiScreenScore,
      aiScreenSummary: updated.aiScreenSummary,
    });
  },
  {
    feature: "recruitment.candidates.manage",
    rateLimit: { max: 5, windowMs: 60_000 },
  },
);
