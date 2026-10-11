/** An additional identity check, never a substitute for server authentication. */
export const OFFLINE_ACTOR_HEADER = "x-amana-action-user";

export function offlineActorHeaders(userId: string | undefined) {
  if (!userId) throw new Error("Please sign in before saving this action.");
  return { [OFFLINE_ACTOR_HEADER]: userId };
}
