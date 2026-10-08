/**
 * May THIS signed-in person release posts to families at THIS centre?
 * One server-side answer for the posts list, create and edit routes:
 * role + the centre's "only admins publish" switch + their own
 * `posts.publish` tick. See canPublishPosts.
 */
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { canPublishPosts, resolveAppSettings } from "@/lib/app-settings";

export async function canPublishAtService(
  session: Session,
  serviceId: string,
): Promise<boolean> {
  const [service, user] = await Promise.all([
    prisma.service.findUnique({ where: { id: serviceId }, select: { appSettings: true } }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { permissions: true } }),
  ]);
  return canPublishPosts(
    session.user.role ?? "",
    resolveAppSettings(service?.appSettings).posts.onlyApproversPublish,
    user?.permissions,
  );
}
