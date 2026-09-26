/** Shared select + mapper for the knowledge console's list/detail responses. */
export const ENTRY_SELECT = {
  id: true, title: true, sourceKind: true, category: true, tier: true, tierOverride: true, qualityArea: true,
  serviceId: true, service: { select: { name: true } }, state: true, version: true, status: true, excludedBy: true, externalUrl: true,
  indexedAt: true, indexError: true, embedded: true, createdAt: true, updatedAt: true, _count: { select: { chunks: true } },
} as const;

export function toEntry<T extends { service: { name: string } | null; _count: { chunks: number } }>(row: T) {
  const { service, _count, ...rest } = row;
  return { ...rest, serviceName: service?.name ?? null, chunkCount: _count.chunks };
}
