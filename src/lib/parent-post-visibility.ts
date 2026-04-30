import { prisma } from "@/lib/prisma";
import type { ParentJwtPayload } from "@/lib/parent-auth";
import type { ParentPost, ParentPostChildTag } from "@prisma/client";

export type VisibilityResult =
  | { post: null; allowed: false }
  | { post: ParentPost & { tags: Pick<ParentPostChildTag, "childId">[] }; allowed: boolean };

/**
 * Determines whether a parent (identified by their magic-link JWT payload)
 * can view a given parent post.
 *
 * Mirrors the visibility rule used by `/api/parent/timeline`:
 *   1. Parent's service(s) = services from their non-draft EnrolmentSubmissions.
 *   2. Post must belong to one of those services.
 *   3. AND (post.isCommunity OR one of parent's children is tagged on the post).
 *
 * Returns both the fetched post (for callers who need `serviceId`) and the
 * boolean decision. `post: null` means the post does not exist at all.
 */
export async function canParentAccessPost(
  parent: ParentJwtPayload,
  postId: string,
): Promise<VisibilityResult> {
  const post = await prisma.parentPost.findUnique({
    where: { id: postId },
    include: { tags: { select: { childId: true } } },
  });
  if (!post) return { post: null, allowed: false };

  if (parent.enrolmentIds.length === 0) {
    return { post, allowed: false };
  }

  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
    select: { serviceId: true, childRecords: { select: { id: true } } },
  });
  const serviceIds = new Set(
    enrolments.map((e) => e.serviceId).filter((s): s is string => !!s),
  );
  const childIds = new Set(enrolments.flatMap((e) => e.childRecords.map((c) => c.id)));

  if (!serviceIds.has(post.serviceId)) return { post, allowed: false };
  if (post.isCommunity) return { post, allowed: true };
  const tagMatches = post.tags.some((t) => childIds.has(t.childId));
  return { post, allowed: tagMatches };
}
