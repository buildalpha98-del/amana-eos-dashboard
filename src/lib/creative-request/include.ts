export const requestInclude = {
  service: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  attachments: true,
} as const;
