import { prisma } from "@/lib/prisma";
import { upsertKnowledgeSource, excludeSources } from "../pipeline";
import type { UpsertResult } from "../types";

/**
 * Reading (`document`) modules of PUBLISHED courses. Quiz content is
 * never indexed — it holds the answers. Any other course status
 * adapter-excludes the course's sources; republishing re-activates them
 * via upsert. Triggers: course PATCH (status transitions) and module
 * create/update/delete (spec §3.3).
 *
 * externalId is `<courseId>:<moduleId>` so "everything under this course"
 * is a prefix query — that is how a DELETED module (no longer in
 * course.modules) still gets excluded on the post-delete sync.
 */
export async function syncLmsCourse(courseId: string): Promise<UpsertResult[]> {
  const course = await prisma.lMSCourse.findUnique({
    where: { id: courseId },
    select: {
      id: true, title: true, status: true, deleted: true, serviceId: true,
      modules: { select: { id: true, title: true, type: true, content: true } },
    },
  });
  if (!course) return [];
  const prefix = `${course.id}:`;

  if (course.status !== "published" || course.deleted) {
    await excludeSources({ sourceKind: "lms_module", externalId: { startsWith: prefix } }, "adapter");
    return [];
  }

  const results: UpsertResult[] = [];
  const indexed: string[] = [];
  for (const m of course.modules) {
    if (m.type !== "document" || !m.content?.trim()) continue;
    const externalId = `${prefix}${m.id}`;
    indexed.push(externalId);
    results.push(
      await upsertKnowledgeSource({
        sourceKind: "lms_module",
        externalId,
        title: `${course.title} — ${m.title}`,
        category: "guide",
        tier: "general",
        text: `# ${course.title} — ${m.title}\n\n${m.content}`,
        externalUrl: "/my-training",
        serviceId: course.serviceId ?? null,
      }),
    );
  }
  await excludeSources(
    { sourceKind: "lms_module", externalId: { startsWith: prefix, notIn: indexed } },
    "adapter",
  );
  return results;
}

export async function syncLmsModule(moduleId: string): Promise<UpsertResult[]> {
  const m = await prisma.lMSModule.findUnique({ where: { id: moduleId }, select: { courseId: true } });
  if (!m) return [];
  return syncLmsCourse(m.courseId);
}
