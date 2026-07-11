import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/server-auth";
import { isAdminRole } from "@/lib/role-permissions";
import { CoursePlayer } from "./CoursePlayer";
import type { PlayerModule } from "./ModuleContent";

export const metadata = { title: "Course | Amana Training" };

/**
 * /learn/[enrollmentId] — the immersive course player (own tab, no sidebar).
 * Loads the enrollment, its course + ordered modules, and this learner's
 * completed-module set. Only the enrolled learner (or an admin) may view it.
 */
export default async function LearnPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;
  const session = await requirePageSession();

  const enrollment = await prisma.lMSEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      course: {
        include: { modules: { orderBy: { sortOrder: "asc" } } },
      },
      moduleProgress: { where: { completed: true }, select: { moduleId: true } },
    },
  });

  if (!enrollment) notFound();

  const isOwner = enrollment.userId === session.user.id;
  if (!isOwner && !isAdminRole(session.user.role as string)) {
    notFound();
  }

  const modules: PlayerModule[] = enrollment.course.modules.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    type: m.type,
    content: m.content,
    resourceUrl: m.resourceUrl,
    documentId: m.documentId,
    duration: m.duration,
  }));

  if (modules.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center text-muted">
        This course has no content yet. Please check back soon.
      </div>
    );
  }

  return (
    <CoursePlayer
      enrollmentId={enrollment.id}
      courseTitle={enrollment.course.title}
      modules={modules}
      initialCompletedIds={enrollment.moduleProgress.map((p) => p.moduleId)}
    />
  );
}
