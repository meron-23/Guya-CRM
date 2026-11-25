import { tx } from "@/lib/tr";
import { useMemo, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { fmtMonth, money } from "@/lib/format";
import type { DB } from "./store";
import { monthlyMoney } from "./report";

/* Validated palette (dataviz validator, light surface, all pairs): revenue / expenses / profit */
const C = { rev: "#0e86a8", exp: "#d9822b", profit: "#7b4fb0" };
const short = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));

/** Revenue vs expenses (bars) with profit (line) — one shared ETB axis. Partners only. */
export function ProfitChart({ db, selected, onSelect }: { db: DB; selected: string; onSelect: (m: string) => void }) {
  const [span, setSpan] = useState<6 | 12>(6);
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => monthlyMoney(db, span), [db, span]);
  const sel = data.find((d) => d.m === selected) ?? data[data.length - 1];
  const totals = data.reduce((a, d) => ({ rev: a.rev + d.rev, exp: a.exp + d.exp }), { rev: 0, exp: 0 });

  const W = 720, H = 260, L = 48, R = 12, T = 14, B = 30;
  const max = Math.max(1, ...data.flatMap((d) => [d.rev, d.exp, d.profit]));
  const min = Math.min(0, ...data.map((d) => d.profit));
  const step = niceStep((max - min) / 4);
  const top = Math.ceil(max / step) * step, bot = Math.floor(min / step) * step;
  const y = (v: number) => T + ((top - v) / (top - bot)) * (H - T - B);
  const band = (W - L - R) / data.length;
  const bw = Math.min(26, band * 0.28);
  const cx = (i: number) => L + band * i + band / 2;
  const ticks: number[] = []; for (let v = bot; v <= top + 1e-6; v += step) ticks.push(v);
  const hi = hover != null ? data[hover] : null;
  const margin = sel.rev ? Math.round((sel.profit / sel.rev) * 100) : 0;

  return (
    <section className="card flex flex-col gap-4 p-5" aria-label={tx("Revenue, expenses and profit")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{tx("Revenue, expenses & profit")}</h2>
          <p className="text-[13px] text-muted">{tx("Revenue = payments received. Click a month to see its expenses below.")}</p>
        </div>
        <div className="flex gap-1.5">
          {([6, 12] as const).map((n) => <button key={n} aria-pressed={span === n} onClick={() => setSpan(n)} className={`chip h-9 ${span === n ? "border-transparent bg-ink font-semibold text-white" : ""}`}>{tx("{n} months", { n })}</button>)}
          <button aria-pressed={table} onClick={() => setTable((v) => !v)} className={`chip h-9 ${table ? "border-transparent bg-ink font-semibold text-white" : ""}`}>{tx("Table")}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={tx("Revenue · {month}", { month: fmtMonth(sel.m, false) })} value={money(sel.rev)} swatch={C.rev} />
        <Stat label={tx("Expenses · {month}", { month: fmtMonth(sel.m, false) })} value={money(sel.exp)} swatch={C.exp} />
        <div className={`flex flex-col gap-1 rounded-xl p-4 ${sel.profit >= 0 ? "bg-leaf-light" : "bg-danger-light"}`}>
          <span className="flex items-center gap-2 text-xs text-body"><span className="h-0.5 w-4 rounded" style={{ background: C.profit }} />{tx("Profit · {month}", { month: fmtMonth(sel.m, false) })}</span>
          <strong className={`flex items-center gap-1.5 text-2xl ${sel.profit >= 0 ? "text-leaf-dark" : "text-danger"}`}>{sel.profit >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}{money(sel.profit)}</strong>
          <span className="text-xs text-body">{sel.rev ? tx("{p}% of revenue kept", { p: margin }) : tx("No revenue this month")} · {tx("each partner {amount}", { amount: money(Math.round(sel.profit / 2)) })}</span>
        </div>
      </div>

      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-2">{tx("Month")}</th><th className="text-right">{tx("Revenue")}</th><th className="text-right">{tx("Expenses")}</th><th className="text-right">{tx("Profit")}</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.m} className="border-t border-line-soft"><td className="py-2">{fmtMonth(d.m)}</td><td className="text-right">{money(d.rev)}</td><td className="text-right">{money(d.exp)}</td><td className={`text-right font-semibold ${d.profit < 0 ? "text-danger" : ""}`}>{money(d.profit)}</td></tr>)}
              <tr className="border-t-2 border-line font-semibold"><td className="py-2">{tx("Total")}</td><td className="text-right">{money(totals.rev)}</td><td className="text-right">{money(totals.exp)}</td><td className="text-right">{money(totals.rev - totals.exp)}</td></tr></tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-4 text-[13px] text-body" aria-hidden>
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: C.rev }} />{tx("Revenue")}</span>
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: C.exp }} />{tx("Expenses")}</span>
            <span className="flex items-center gap-2"><span className="relative h-0.5 w-5 rounded" style={{ background: C.profit }}><span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ background: C.profit }} /></span>{tx("Profit")}</span>
          </div>
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={tx("Revenue, expenses and profit for the last {n} months", { n: span })} onMouseLeave={() => setHover(null)}>
              {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#b9c4c6" : "#e8eded"} strokeWidth={1} /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#6b7a7d">{short(v)}</text></g>)}
              {data.map((d, i) => {
                const isSel = d.m === sel.m;
                return (
                  <g key={d.m}>
                    {(isSel || hover === i) && <rect x={L + band * i + 2} y={T - 6} width={band - 4} height={H - T - B + 6} rx={8} fill={isSel ? "#e1f1f4" : "#f2f5f5"} />}
                    <path d={barPath(cx(i) - bw - 1, y(d.rev), bw, y(0) - y(d.rev))} fill={C.rev} />
                    <path d={barPath(cx(i) + 1, y(d.exp), bw, y(0) - y(d.exp))} fill={C.exp} />
                    <text x={cx(i)} y={H - 10} textAnchor="middle" fontSize="11.5" fontWeight={isSel ? 700 : 400} fill={isSel ? "#17292d" : "#6b7a7d"}>{(() => { const n = fmtMonth(d.m, false).split(" ")[0]; return span === 12 && /^[A-Za-z]/.test(n) ? n.slice(0, 3) : n; })()}</text>
                  </g>
                );
              })}
              <polyline points={data.map((d, i) => `${cx(i)},${y(d.profit)}`).join(" ")} fill="none" stroke={C.profit} strokeWidth={2} strokeLinejoin="round" />
              {data.map((d, i) => <circle key={d.m} cx={cx(i)} cy={y(d.profit)} r={hover === i ? 6 : 4.5} fill={C.profit} stroke="#fff" strokeWidth={2} />)}
              {data.map((d, i) => <rect key={d.m} x={L + band * i} y={0} width={band} height={H} fill="transparent" style={{ cursor: "pointer" }} onMouseEnter={() => setHover(i)} onClick={() => onSelect(d.m)}><title>{fmtMonth(d.m)}</title></rect>)}
            </svg>
            {hi && hover != null && (
              <div className="pointer-events-none absolute top-2 z-10 w-48 rounded-xl border border-line bg-white p-3 text-[13px] shadow-lg" style={{ left: `clamp(0px, calc(${(cx(hover) / W) * 100}% + ${hover > data.length / 2 ? "-210px" : "14px"}), calc(100% - 192px))` }}>
                <strong className="mb-1.5 block">{fmtMonth(hi.m)}</strong>
                {([[tx("Revenue"), hi.rev, C.rev], [tx("Expenses"), hi.exp, C.exp], [tx("Profit"), hi.profit, C.profit]] as const).map(([l, v, c]) => (
                  <span key={l} className="flex items-center justify-between gap-2 py-0.5"><span className="flex items-center gap-2 text-body"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{l}</span><strong className={v < 0 ? "text-danger" : ""}>{money(v)}</strong></span>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-muted">{tx("Last {n} months: {rev} revenue − {exp} expenses =", { n: span, rev: money(totals.rev), exp: money(totals.exp) })} <strong className="text-ink">{tx("{amount} profit", { amount: money(totals.rev - totals.exp) })}</strong> ({tx("each partner {amount}", { amount: money(Math.round((totals.rev - totals.exp) / 2)) })}).</p>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, swatch }: { label: string; value: string; swatch: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-canvas p-4">
      <span className="flex items-center gap-2 text-xs text-body"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: swatch }} />{label}</span>
      <strong className="text-2xl">{value}</strong>
    </div>
  );
}
function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
/** Bar with 4px rounded top, flat on the baseline. Negative/zero heights draw nothing. */
function barPath(x: number, yTop: number, w: number, h: number) {
  if (h <= 0.5) return "";
  const r = Math.min(4, h, w / 2);
  return `M${x},${yTop + h}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yTop + h}Z`;
}
