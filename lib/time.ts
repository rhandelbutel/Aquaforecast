// lib/time.ts
export function manilaNow() {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = Number(get("hour"));
  const dateKey = `${year}-${month}-${day}`;
  const bucketStart = String(Math.floor(hour / 4) * 4).padStart(2, "0");
  return { dateKey, hour, bucketStart };
}

export function todayKeyManila() {
  return manilaNow().dateKey;
}

export function yesterdayKeyManila() {
  const now = new Date();
  const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(y);
}
