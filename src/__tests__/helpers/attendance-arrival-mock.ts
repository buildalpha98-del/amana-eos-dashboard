import type { AttendanceRecord, Prisma } from "@prisma/client";
import { prismaMock } from "./prisma-mock";

/** Stateful handover fixture; create/conditional update/read share the same rows. */
export function mockArrivalRecords(initial: Partial<AttendanceRecord>[] = []) {
  const rows = new Map<string, Partial<AttendanceRecord>>();
  const key = (row: Partial<AttendanceRecord>) =>
    `${row.childId}|${row.serviceId}|${row.date?.getTime()}|${row.sessionType}`;
  for (const row of initial) rows.set(key(row), { ...row });
  prismaMock.attendanceRecord.createMany.mockImplementation(
    async ({ data }: { data: Prisma.AttendanceRecordCreateManyInput[] }) => {
      let count = 0;
      for (const input of data) {
        const row = {
          ...input,
          date: new Date(input.date),
          signOutTime: null,
        } as Partial<AttendanceRecord>;
        if (!rows.has(key(row))) {
          rows.set(key(row), { id: `record-${rows.size}`, ...row });
          count++;
        }
      }
      return { count };
    },
  );
  prismaMock.attendanceRecord.updateMany.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: Partial<AttendanceRecord>;
      data: Partial<AttendanceRecord>;
    }) => {
      const row = rows.get(key(where));
      if (!row || row.signInTime || row.signOutTime) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  );
  prismaMock.attendanceRecord.findUnique.mockImplementation(
    async ({
      where,
    }: {
      where: { childId_serviceId_date_sessionType: Partial<AttendanceRecord> };
    }) => {
      const row = rows.get(key(where.childId_serviceId_date_sessionType));
      return row ? { ...row } : null;
    },
  );
  return rows;
}
