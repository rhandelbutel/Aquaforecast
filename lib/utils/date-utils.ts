// lib/utils/date-utils.ts
export function toDate(v: any): Date {
  if (!v) return new Date(0);
  if (v instanceof Date) return v;
  if (v?.seconds) return new Date(v.seconds * 1000);
  if (typeof v === "string") return new Date(v);
  return new Date(0);
}

export function reminderDocId(isoDate: string, time: string, userId: string) {
  return `${isoDate}_${time}_${userId}`;
}
