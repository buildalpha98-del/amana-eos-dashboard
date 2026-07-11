/**
 * GET /api/surveys/[id]/results — aggregated results.
 *
 * Returns per-question aggregates:
 *   yes_no        → { yes: n, no: n }
 *   single_choice → { counts: [n_option_0, n_option_1, ...] }
 *   multi_choice  → same shape as single_choice (multi-count possible per response)
 *   short_text    → { textAnswers: string[] }   (individual answers)
 *   long_text     → { textAnswers: string[] }
 *   rating        → { average: number, distribution: [n_1, n_2, n_3, n_4, n_5] }
 *
 * Aggregation runs at request time — cheap for typical N (surveys
 * with <10k responses). If it becomes a hot spot we'll pre-aggregate
 * into a materialised summary row.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import type { SurveyQuestionType } from "@prisma/client";

type Agg =
  | { type: "yes_no"; yes: number; no: number }
  | { type: "single_choice"; counts: number[] }
  | { type: "multi_choice"; counts: number[] }
  | { type: "short_text"; textAnswers: string[] }
  | { type: "long_text"; textAnswers: string[] }
  | { type: "rating"; average: number; distribution: number[] };

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await context!.params!;
    const survey = await prisma.survey.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { sortOrder: "asc" } },
        _count: { select: { responses: true } },
      },
    });
    if (!survey || survey.deleted) throw ApiError.notFound("Survey not found");

    const answers = await prisma.surveyAnswer.findMany({
      where: { question: { surveyId: id } },
    });

    const byQuestion = new Map<string, typeof answers>();
    for (const a of answers) {
      const arr = byQuestion.get(a.questionId) ?? [];
      arr.push(a);
      byQuestion.set(a.questionId, arr);
    }

    const results = survey.questions.map((q) => {
      const rows = byQuestion.get(q.id) ?? [];
      return {
        questionId: q.id,
        title: q.title,
        type: q.type,
        options: q.options,
        responseCount: rows.length,
        aggregate: aggregate(q.type, q.options.length, rows),
      };
    });

    return NextResponse.json({
      survey: {
        id: survey.id,
        title: survey.title,
        status: survey.status,
        anonymous: survey.anonymous,
        responseCount: survey._count.responses,
      },
      results,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);

function aggregate(
  type: SurveyQuestionType,
  optionCount: number,
  rows: Array<{
    yesNo: boolean | null;
    choiceIndexes: number[];
    textValue: string | null;
    ratingValue: number | null;
  }>,
): Agg {
  switch (type) {
    case "yes_no":
      return {
        type,
        yes: rows.filter((r) => r.yesNo === true).length,
        no: rows.filter((r) => r.yesNo === false).length,
      };
    case "single_choice":
    case "multi_choice": {
      const counts = new Array(optionCount).fill(0) as number[];
      for (const r of rows) {
        for (const idx of r.choiceIndexes) {
          if (idx >= 0 && idx < counts.length) counts[idx]++;
        }
      }
      return { type, counts };
    }
    case "short_text":
    case "long_text":
      return {
        type,
        textAnswers: rows
          .map((r) => r.textValue)
          .filter((s): s is string => !!s && s.trim() !== ""),
      };
    case "rating": {
      const distribution = [0, 0, 0, 0, 0];
      let sum = 0;
      let n = 0;
      for (const r of rows) {
        if (r.ratingValue && r.ratingValue >= 1 && r.ratingValue <= 5) {
          distribution[r.ratingValue - 1]++;
          sum += r.ratingValue;
          n++;
        }
      }
      return {
        type,
        average: n > 0 ? Number((sum / n).toFixed(2)) : 0,
        distribution,
      };
    }
  }
}
