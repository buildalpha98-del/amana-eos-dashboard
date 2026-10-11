/** A shift row is not a person. Count each eligible educator once per room. */
export interface ClockedShift {
  sessionType: string;
  status: string;
  actualStart: Date | null;
  actualEnd: Date | null;
  user: {
    id: string;
    active: boolean;
    isCentreAccount: boolean;
    excludeFromRatio: boolean;
  } | null;
}

export function clockedInEducatorIds(
  shifts: ClockedShift[],
  sessionType: string,
  now: Date,
): string[] {
  return [
    ...new Set(
      shifts
        .filter(
          (shift) =>
            shift.sessionType === sessionType &&
            shift.status === "published" &&
            shift.actualStart &&
            shift.actualStart <= now &&
            !shift.actualEnd &&
            shift.user?.active &&
            !shift.user.isCentreAccount &&
            !shift.user.excludeFromRatio,
        )
        .map((shift) => shift.user!.id),
    ),
  ];
}
