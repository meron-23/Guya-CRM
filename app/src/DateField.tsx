import { tx, txLang } from "@/lib/tr";
import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { calendar, ethDaysInMonth, fmtDate, fromEth, MONTHS_LONG, toEth, todayISO, WEEKDAYS_MON } from "@/lib/format";

/* Calendar helpers: month index m is 0-based. Ethiopian has 13 months (Pagume = 12). */
const eth = () => calendar() === "eth";
const ymOf = (v: string): [number, number] => { if (eth()) { const e = toEth(v); return [e.y, e.m - 1]; } return [Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1]; };
const monthsIn = () => (eth() ? 13 : 12);
const dimOf = (y: number, m: number) => (eth() ? ethDaysInMonth(y, m + 1) : new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
const isoOf = (y: number, m: number, d: number) => (eth() ? fromEth(y, m + 1, d) : iso(y, m, d));
const G_AM = ["ጃንዋሪ", "ፌብሩዋሪ", "ማርች", "ኤፕሪል", "ሜይ", "ጁን", "ጁላይ", "ኦገስት", "ሴፕቴምበር", "ኦክቶበር", "ኖቬምበር", "ዲሴምበር"];
const gregLabel = (v: string) => { const d = new Date(v + "T12:00:00Z"); return txLang() === "am" ? `${G_AM[d.getUTCMonth()]} ${d.getUTCDate()}፣ ${d.getUTCFullYear()} (እ.ኤ.አ.)` : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** A clear date picker: a button that shows the date with a calendar icon, opening a month calendar with month/year dropdowns. */
export function DateField({ label, value, onChange, min, max, hint, small, placeholder, align = "left", required }: {
  label?: React.ReactNode; value: string; onChange: (v: string) => void; min?: string; max?: string; hint?: React.ReactNode;
  small?: boolean; placeholder?: string; align?: "left" | "right"; required?: boolean;
}) {
  placeholder = placeholder ?? tx("Pick a date");
  const [open, setOpen] = useState(false);
  const base = value || (max && max < todayISO() ? max : todayISO());
  const [y, setY] = useState(ymOf(base)[0]);
  const [m, setM] = useState(ymOf(base)[1]);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const b = value || base; const [yy, mm] = ymOf(b); setY(yy); setM(mm);
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const shift = (n: number) => { const k = monthsIn(); const t = m + n; setY(y + Math.floor(t / k)); setM(((t % k) + k) % k); };
  const first = (new Date(isoOf(y, m, 1) + "T12:00:00Z").getUTCDay() + 6) % 7;
  const days = dimOf(y, m);
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = todayISO();
  const nowY = ymOf(today)[0];
  const years = Array.from({ length: 26 }, (_, i) => nowY + 2 - i);
  const ok = (d: string) => (!min || d >= min) && (!max || d <= max);

  return (
    <div className={`label relative ${small ? "text-xs" : ""}`} ref={ref}>
      {label && <span id={id}>{label}{required && " *"}</span>}
      <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-labelledby={label ? id : undefined} aria-label={label ? undefined : placeholder} data-date={value}
        onClick={() => setOpen((v) => !v)}
        className={`input flex items-center gap-2.5 text-left font-normal ${small ? "h-10 text-sm" : ""} ${open ? "border-brand ring-2 ring-brand/20" : ""}`}>
        <CalendarDays size={small ? 16 : 18} className="flex-none text-brand" />
        <span className={`flex-1 truncate ${value ? "text-ink" : "text-muted"}`}>{value ? fmtDate(value, { weekday: !small, year: true }) : placeholder}</span>
        <ChevronDown size={16} className={`flex-none text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      {open && (
        <div role="dialog" aria-label={tx("Choose a date")} className={`absolute top-full z-50 mt-1.5 w-[300px] rounded-2xl border border-line bg-white p-3 text-ink shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
          <div className="mb-2 flex items-center gap-1.5">
            <button type="button" onClick={() => shift(-1)} aria-label={tx("Previous month")} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-canvas"><ChevronLeft size={18} /></button>
            <select aria-label={tx("Month")} value={m} onChange={(e) => setM(Number(e.target.value))} className="h-9 flex-1 rounded-lg border border-line bg-white px-2 text-sm font-semibold">{MONTHS_LONG().map((n, i) => <option key={n} value={i}>{n}</option>)}</select>
            <select aria-label={tx("Year")} value={y} onChange={(e) => setY(Number(e.target.value))} className="h-9 w-[84px] rounded-lg border border-line bg-white px-2 text-sm font-semibold">{years.map((n) => <option key={n} value={n}>{n}</option>)}</select>
            <button type="button" onClick={() => shift(1)} aria-label={tx("Next month")} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-canvas"><ChevronRight size={18} /></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS_MON().map((w) => <span key={w} className="py-1 text-[11px] font-semibold uppercase text-muted">{w}</span>)}
            {cells.map((d, i) => {
              if (d == null) return <span key={`e${i}`} />;
              const v = isoOf(y, m, d); const sel = v === value; const isToday = v === today; const can = ok(v);
              return (
                <button key={v} type="button" disabled={!can} aria-label={fmtDate(v, { weekday: true, year: true })} aria-pressed={sel}
                  onClick={() => { onChange(v); setOpen(false); }}
                  className={`h-9 rounded-lg text-sm transition ${sel ? "bg-brand font-bold text-white" : isToday ? "font-bold text-brand ring-1 ring-brand/40" : "hover:bg-brand-light"} ${!can ? "cursor-not-allowed opacity-30" : ""}`}>{d}</button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line-soft pt-2">
            <button type="button" disabled={!ok(today)} onClick={() => { onChange(today); setOpen(false); }} className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-brand hover:bg-brand-light disabled:opacity-40">{tx("Today")}</button>
            {eth() && value && <span className="text-[11px] text-muted" title={tx("Same date in the international calendar")}>= {gregLabel(value)}</span>}
            {!required && value && <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-canvas">{tx("Clear")}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
