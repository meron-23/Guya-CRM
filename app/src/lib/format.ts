import { txLang } from "./tr";
import { ETH_MONTHS_AM, ETH_MONTHS_EN, ethDaysInMonth, fromEth, toEth } from "./ethio";

/** Which calendar the app shows and bills by. Ethiopian months bill 1–30; Pagume is part of Nehase. */
export type Calendar = "eth" | "greg";
let cal: Calendar = "eth";
export const setCalendar = (c: Calendar) => { cal = c; };
export const calendar = () => cal;
export const TZ = "Africa/Addis_Ababa";

/** Today's date in Addis Ababa as YYYY-MM-DD. */
export function todayISO(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
export function isoFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoFromDate(d);
}
export function monthStart(iso: string): string {
  if (cal === "eth") { const e = toEth(iso); return fromEth(e.y, Math.min(e.m, 12), 1); }
  return iso.slice(0, 7) + "-01";
}
export function addMonths(iso: string, n: number): string {
  if (cal === "eth") {
    const e = toEth(monthStart(iso)); const idx = e.y * 12 + (Math.min(e.m, 12) - 1) + n;
    return fromEth(Math.floor(idx / 12), (idx % 12) + 1, 1);
  }
  const d = parseISO(monthStart(iso));
  d.setUTCMonth(d.getUTCMonth() + n);
  return isoFromDate(d);
}
/** Start and end of the year containing iso (Ethiopian year: Meskerem 1 – Pagume). */
export function yearRange(iso: string): [string, string] {
  if (cal === "eth") { const y = toEth(iso).y; return [fromEth(y, 1, 1), addDays(fromEth(y + 1, 1, 1), -1)]; }
  return [iso.slice(0, 4) + "-01-01", iso.slice(0, 4) + "-12-31"];
}
/** Day of its billing month (1-based) and how many days that month has. */
export function dayOfMonth(iso: string) {
  const start = monthStart(iso);
  return { day: daysBetween(start, iso) + 1, days: daysBetween(start, monthEnd(iso)) + 1 };
}
export { ethDaysInMonth, fromEth, toEth };
export function monthEnd(iso: string): string {
  return addDays(addMonths(iso, 1), -1);
}
/** Monday of the week containing iso. */
export function weekStart(iso: string): string {
  const d = parseISO(iso);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}
/** Date (YYYY-MM-DD) of a timestamp in Addis Ababa. */
export function dateInTZ(ts: string | null | undefined): string {
  if (!ts) return "";
  return todayISO(new Date(ts));
}
/** ISO timestamp for a local Addis date + time (Addis is UTC+3, no DST). */
export function addisToUTC(date: string, time = "09:00"): string {
  return new Date(`${date}T${time}:00+03:00`).toISOString();
}
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parseISO(toISO).getTime() - parseISO(fromISO).getTime()) / 86400000);
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_EN_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MONTHS_AM_LONG = ["ጃንዋሪ", "ፌብሩዋሪ", "ማርች", "ኤፕሪል", "ሜይ", "ጁን", "ጁላይ", "ኦገስት", "ሴፕቴምበር", "ኦክቶበር", "ኖቬምበር", "ዲሴምበር"];
const MONTHS_AM = ["ጃን", "ፌብ", "ማርች", "ኤፕሪ", "ሜይ", "ጁን", "ጁላይ", "ኦገስ", "ሴፕቴ", "ኦክቶ", "ኖቬም", "ዲሴም"];
const DAYS_AM = ["እሑድ", "ሰኞ", "ማክሰ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"];
export const MONTHS_LONG = () => (cal === "eth" ? (txLang() === "am" ? ETH_MONTHS_AM : ETH_MONTHS_EN) : txLang() === "am" ? MONTHS_AM_LONG : MONTHS_EN_LONG);
export const WEEKDAYS_MON = () => (txLang() === "am" ? ["ሰኞ", "ማክ", "ረቡ", "ሐሙ", "ዓር", "ቅዳ", "እሑ"] : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);

export function fmtDate(iso: string | null | undefined, opts: { weekday?: boolean; year?: boolean } = {}): string {
  if (!iso) return "—";
  const d = parseISO(iso);
  const am = txLang() === "am";
  let parts: string[];
  if (cal === "eth") {
    const e = toEth(iso);
    parts = am ? [`${(ETH_MONTHS_AM)[e.m - 1]} ${e.d}`] : [`${e.d} ${ETH_MONTHS_EN[e.m - 1]}`];
    if (opts.year) parts.push(am ? `፣ ${e.y}` : String(e.y));
    const main = parts.join(am ? "" : " ");
    return opts.weekday ? `${(am ? DAYS_AM : DAYS_EN)[d.getUTCDay()]}${am ? "፣" : ""} ${main}` : main;
  }
  parts = [`${d.getUTCDate()} ${(am ? MONTHS_AM : MONTHS_EN)[d.getUTCMonth()]}`];
  if (opts.year) parts.push(String(d.getUTCFullYear()));
  const main = parts.join(" ");
  return opts.weekday ? `${(am ? DAYS_AM : DAYS_EN)[d.getUTCDay()]}${am ? "፣" : ""} ${main}` : main;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function fmtMonth(iso: string | null | undefined, long = true): string {
  if (!iso) return "—";
  const am = txLang() === "am";
  if (cal === "eth") { const e = toEth(monthStart(iso)); return `${(am ? ETH_MONTHS_AM : ETH_MONTHS_EN)[e.m - 1]} ${e.y}`; }
  const d = parseISO(iso);
  return `${(long ? (am ? MONTHS_AM_LONG : MONTHS_EN_LONG) : am ? MONTHS_AM : MONTHS_EN)[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function fmtTime(ts: string | null | undefined): string {
  if (!ts) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
}
export function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  return `${fmtDate(dateInTZ(ts), { weekday: true })}${txLang() === "am" ? "፣" : ","} ${fmtTime(ts)}`;
}

export function money(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  const s = v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return txLang() === "am" ? `${s} ብር` : `ETB ${s}`;
}
export function num(n: number | string | null | undefined): string {
  return Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Ethiopian numbers → international digits (2519XXXXXXXX). */
export function intlPhone(raw: string | null | undefined): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "251" + d.slice(1);
  else if (d.length === 9 && (d.startsWith("9") || d.startsWith("7"))) d = "251" + d;
  return d;
}
export function telHref(raw: string) {
  const p = intlPhone(raw);
  return p ? `tel:+${p}` : "";
}
export function waHref(raw: string, text = "") {
  const p = intlPhone(raw);
  return p ? `https://wa.me/${p}${text ? `?text=${encodeURIComponent(text)}` : ""}` : "";
}
export function tgHref(username: string, phone: string) {
  const u = (username ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
  if (u) return `https://t.me/${u}`;
  const p = intlPhone(phone);
  return p ? `https://t.me/+${p}` : "";
}
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
export function ageFromDob(dob: string | null, today = todayISO()): string {
  if (!dob) return "";
  const a = parseISO(dob), b = parseISO(today);
  let y = b.getUTCFullYear() - a.getUTCFullYear();
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) y--;
  return y >= 0 ? (txLang() === "am" ? `${y} ዓመት` : `${y} yrs`) : "";
}
