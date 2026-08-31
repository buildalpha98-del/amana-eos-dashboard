/**
 * Fan-out when a post is published.
 *
 * The rule that keeps this from becoming noise: EVERY published post
 * raises the in-app bell (cheap, silent, dismissible), but only
 * announcements and reminders BUZZ THE PHONE. A push per observation is
 * how families turn notifications off, and then the announcement that
 * mattered reaches nobody.
 *
 * Fire-and-forget from the publish paths — a notification failure must
 * never fail the post.
 *
 * KNOWN LIMIT: scheduled posts become visible at read time (publishAt
 * <= now) with no cron flipping them, so nothing fires when a scheduled
 * post's moment arrives. Those families still see it in the feed and on
 * the bell's next open; wiring a scheduler for them belongs with the
 * digest work, not here.
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendPushToContact } from "@/lib/push/webPush";

/** Categories urgent enough to interrupt someone's day. */
const PUSH_WORTHY = new Set(["announcement", "reminder"]);

export async function notifyPostPublished(postId: string): Promise<void> {
  try {
    const post = await prisma.parentPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        serviceId: true,
        service: { select: { name: true } },
      },
    });
    if (!post || post.status !== "published") return;

    // Every family with an active contact at the centre. The feed itself
    // is scoped the same way, so the audience matches what they can see.
    const contacts = await prisma.centreContact.findMany({
      // email is a required column on CentreContact — no null filter
      // needed, and Prisma rejects one on a non-nullable field.
      where: { serviceId: post.serviceId, status: "active" },
      select: { id: true, email: true },
    });
    if (contacts.length === 0) return;

    const title =
      post.type === "announcement"
        ? `Announcement from ${post.service.name}`
        : `New from ${post.service.name}`;

    // One createMany, not a row at a time — a big centre is a hundred
    // families, and this runs inside a request.
    await prisma.parentNotification.createMany({
      data: contacts.map((c) => ({
        parentEmail: c.email.toLowerCase().trim(),
        type: "post",
        title,
        body: post.title,
        link: "/parent",
      })),
    });

    if (PUSH_WORTHY.has(post.type)) {
      // Sequential on purpose: a burst of parallel pushes to a hundred
      // endpoints is how a serverless function gets throttled mid-loop
      // and half the centre hears nothing.
      for (const c of contacts) {
        await sendPushToContact(c.id, {
          title,
          body: post.title,
          url: "/parent",
        }).catch(() => {
          /* per-family push failure is that family's stale subscription,
             not a reason to stop the loop */
        });
      }
    }

    logger.info("Post fan-out complete", {
      postId,
      families: contacts.length,
      pushed: PUSH_WORTHY.has(post.type),
    });
  } catch (err) {
    logger.error("Post fan-out failed", { postId, err });
  }
}
