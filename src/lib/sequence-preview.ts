import { prisma } from "@/lib/prisma";
import {
  getSequenceLayoutOptions,
  renderSequenceStepEmail,
  type RenderSource,
  type SequenceKind,
} from "@/lib/sequence-email-render";

/**
 * Renders every email sequence ("flow") with sample recipient data, for the
 * CRM → Email flows page and the send-to-a-colleague review pack. Rendering
 * goes through `renderSequenceStepEmail` — the same function the
 * `nurture-send` cron uses — so the preview can't drift from real sends.
 */

const BASE_URL = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

export const SAMPLE_PARENT_NAME = "Sarah";
export const SAMPLE_LEAD_NAME = "Jane";
export const SAMPLE_SCHOOL_NAME = "Sample Primary School";

export interface FlowStepPreview {
  id: string;
  stepNumber: number;
  name: string;
  delayHours: number;
  templateKey: string;
  subject: string;
  html: string;
  source: RenderSource;
}

export interface FlowPreview {
  id: string;
  name: string;
  type: SequenceKind;
  triggerStage: string | null;
  isActive: boolean;
  activeEnrolments: number;
  steps: FlowStepPreview[];
}

export async function buildFlowPreviews(opts?: { sequenceIds?: string[] }): Promise<{
  flows: FlowPreview[];
  sampleCentre: string;
}> {
  const [sequences, service, layoutOpts] = await Promise.all([
    prisma.sequence.findMany({
      where: opts?.sequenceIds ? { id: { in: opts.sequenceIds } } : undefined,
      include: {
        steps: {
          orderBy: { stepNumber: "asc" },
          include: {
            emailTemplate: { select: { subject: true, blocks: true, htmlContent: true } },
          },
        },
        _count: { select: { enrolments: { where: { status: "active" } } } },
      },
      orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    }),
    // A real centre makes the parent emails read naturally (address, video,
    // website). Any active one will do — it's a sample.
    prisma.service.findFirst({
      where: { status: "active" },
      select: {
        name: true,
        code: true,
        address: true,
        suburb: true,
        state: true,
        orientationVideoUrl: true,
      },
      orderBy: { name: "asc" },
    }),
    getSequenceLayoutOptions(),
  ]);

  const sampleCentre = service?.name ?? "Amana OSHC";

  const flows: FlowPreview[] = [];
  for (const seq of sequences) {
    const isParent = seq.type === "parent_nurture";
    const steps: FlowStepPreview[] = [];
    for (const step of seq.steps) {
      const rendered = await renderSequenceStepEmail(step, {
        sequenceType: seq.type,
        name: isParent ? SAMPLE_PARENT_NAME : SAMPLE_LEAD_NAME,
        // Mirrors nurture-send: parents see their centre, CRM leads the sequence name.
        centreName: isParent ? sampleCentre : seq.name,
        schoolName: isParent ? "" : SAMPLE_SCHOOL_NAME,
        enrolUrl: `${BASE_URL}/enrol`,
        feedbackUrl: `${BASE_URL}/survey/feedback`,
        service: isParent ? service : null,
        layoutOpts,
      });
      steps.push({
        id: step.id,
        stepNumber: step.stepNumber,
        name: step.name,
        delayHours: step.delayHours,
        templateKey: step.templateKey,
        ...rendered,
      });
    }
    flows.push({
      id: seq.id,
      name: seq.name,
      type: seq.type,
      triggerStage: seq.triggerStage,
      isActive: seq.isActive,
      activeEnrolments: seq._count.enrolments,
      steps,
    });
  }

  return { flows, sampleCentre };
}
