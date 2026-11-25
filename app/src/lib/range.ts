import { addMonths, fmtDate, monthEnd, monthStart, todayISO, weekStart, addDays, yearRange } from "@/lib/format";
import type { Key } from "@/lib/i18n";

export type RangeKey = "today" | "week" | "lastWeek" | "month" | "lastMonth" | "year" | "custom";
export const RANGE_KEYS: Exclude<RangeKey, "lastWeek">[] = ["today", "week", "month", "lastMonth", "year", "custom"];
export const RANGE_LABEL: Record<Exclude<RangeKey, "lastWeek">, Key> = {
  today: "range.today", week: "range.week", month: "range.month", lastMonth: "range.lastMonth", year: "range.year", custom: "range.custom",
};
const isISO = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function resolveRange(key: string | undefined, from?: string, to?: string, fallback: RangeKey = "month") {
  const today = todayISO();
  const k = ([...RANGE_KEYS, "lastWeek"] as string[]).includes(key ?? "") ? (key as RangeKey) : fallback;
  let f = today, t = today;
  switch (k) {
    case "today": break;
    case "week": f = weekStart(today); t = addDays(f, 6); break;
    case "lastWeek": f = addDays(weekStart(today), -7); t = addDays(f, 6); break;
    case "month": f = monthStart(today); t = monthEnd(today); break;
    case "lastMonth": f = addMonths(today, -1); t = monthEnd(f); break;
    case "year": [f, t] = yearRange(today); break;
    case "custom":
      f = isISO(from) ? from! : monthStart(today);
      t = isISO(to) ? to! : today;
      if (f > t) [f, t] = [t, f];
      break;
  }
  const label = f === t ? fmtDate(f, { weekday: true, year: true }) : `${fmtDate(f)} – ${fmtDate(t, { year: true })}`;
  return { key: k, from: f, to: t, label };
}
