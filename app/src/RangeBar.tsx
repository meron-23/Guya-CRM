import { tx } from "@/lib/tr";
import { CalendarDays } from "lucide-react";
import { DateField } from "./DateField";
import { RANGE_KEYS, RANGE_LABEL, type RangeKey } from "@/lib/range";
import { useApp } from "./ui";

export function RangeBar({ value, onChange, from, to, onDates, keys = RANGE_KEYS }: {
  value: RangeKey; onChange: (k: RangeKey) => void; from: string; to: string; onDates: (from: string, to: string) => void; keys?: Exclude<RangeKey, "lastWeek">[];
}) {
  const { t } = useApp();
  return (
    <div className="card flex flex-wrap items-end gap-2 p-2.5" role="group" aria-label={tx("Date range")}>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 sm:flex-wrap">
        {keys.map((k) => (
          <button key={k} onClick={() => onChange(k)} aria-pressed={value === k} className={`chip ${value === k ? "border-transparent bg-brand font-semibold text-white" : ""}`}>{k === "custom" && <CalendarDays size={14} className="mr-1 inline" />}{t(RANGE_LABEL[k])}</button>
        ))}
      </div>
      {value === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[220px]"><DateField small required label={t("range.from")} value={from} max={to} onChange={(v) => v && onDates(v, to)} /></div>
          <div className="w-[220px]"><DateField small required align="right" label={t("range.to")} value={to} min={from} onChange={(v) => v && onDates(from, v)} /></div>
        </div>
      )}
    </div>
  );
}
