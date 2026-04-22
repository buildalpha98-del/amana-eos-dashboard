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
          },
        },
      },
    });
    if (!candidate) {
      throw ApiError.notFound("Candidate not found");
    }
    if (!candidate.resumeText || candidate.resumeText.trim().length === 0) {
      throw ApiError.badRequest("Candidate has no resume text to screen");
    }

    const prompt = buildScreenPrompt({
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      candidatePhone: candidate.phone,
      resumeText: candidate.resumeText,
      vacancyRole: candidate.vacancy.role,
      employmentType: candidate.vacancy.employmentType,
      qualificationRequired: candidate.vacancy.qualificationRequired,
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
