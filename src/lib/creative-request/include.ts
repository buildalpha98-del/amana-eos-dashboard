export const requestInclude = {
  service: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  /// Brief-level attachments only (messageId null). Message attachments —
  /// including ones on internal-only notes — must NOT leak through the
  /// request detail/list routes, which are requester-accessible; the thread
  /// endpoint (/messages) serves those with correct internal filtering.
  attachments: { where: { messageId: null } },
} as const;

/** Relations serialized with every proof (list, upload, decision responses). */
export const proofInclude = {
  uploadedBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} as const;
