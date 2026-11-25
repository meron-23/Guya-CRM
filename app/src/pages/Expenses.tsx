import { tx } from "@/lib/tr";
import { DateField } from "../DateField";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Pencil, Wallet, Home, Banknote, Zap, Package } from "lucide-react";
import { useStore } from "../store";
import { ProfitChart } from "../ProfitChart";
import { Bar, ConfirmButton, Empty, PageHeader, PartnersBadge, useApp } from "../ui";
import { addMonths, fmtDate, fmtMonth, money, monthEnd, monthStart, todayISO } from "@/lib/format";
import { EXPENSE_CATS, EXPENSE_COLOR, EXPENSE_HINT, EXPENSE_LABEL, METHODS } from "@/lib/labels";
import type { Expense } from "@/lib/types";

const ICON = { rent: Home, salaries: Banknote, utilities: Zap, misc: Package };
const SOFT: Record<string, string> = { rent: "bg-brand-light", salaries: "bg-leaf-light", utilities: "bg-amber-light", misc: "bg-plum-light" };

export default function Expenses() {
  const { db, update, newId } = useStore();
  const { go, t, toast } = useApp();
  const today = todayISO();
  const [m, setM] = useState(monthStart(today));
  const [editing, setEditing] = useState<Expense | null>(null);
  const blank = { category: "rent", description: "", amount: "", spent_on: "", method: "cash", note: "" };
  const [f, setF] = useState(blank);
  const [error, setError] = useState("");
  const prev = addMonths(m, -1);
  const items = db.expenses.filter((e) => e.spent_on >= m && e.spent_on <= monthEnd(m)).sort((a, b) => a.spent_on.localeCompare(b.spent_on));
  const total = items.reduce((a, e) => a + Number(e.amount), 0);
  const prevTotal = db.expenses.filter((e) => e.spent_on >= prev && e.spent_on <= monthEnd(prev)).reduce((a, e) => a + Number(e.amount), 0);
  const diff = total - prevTotal;
  const isThis = m === monthStart(today);
  const defDate = isThis ? today : m;
  const sugg = [...new Set(db.expenses.filter((e) => e.category === f.category).map((e) => e.description))];

  function save(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(f.amount.replace(/,/g, ""));
    if (!f.description.trim()) return setError(tx("Describe the expense"));
    if (!Number.isFinite(amt) || amt <= 0) return setError(tx("Enter the amount"));
    const date = f.spent_on || defDate;
    const data = { category: f.category as Expense["category"], description: f.description.trim(), amount: amt, spent_on: date, method: f.method, note: f.note.trim() };
    if (editing) update((d) => Object.assign(d.expenses.find((x) => x.id === editing.id)!, data), ["Updated expense · {what} · {amount}", { what: data.description, amount: amt }]);
    else update((d) => { d.expenses.push({ id: newId(), created_at: new Date().toISOString(), ...data }); }, ["Added expense · {what} · {amount}", { what: data.description, amount: amt }]);
    toast(editing ? tx("Expense updated") : tx("Expense added")); setEditing(null); setF({ ...blank, category: f.category }); setError(""); setM(monthStart(date));
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={Wallet} tone="plum" title={t("exp.title")} badge={<PartnersBadge label={t("common.partnersOnly")} />} subtitle={tx("What the branch spends, and what is left as profit")}
        actions={<button className="btn btn-secondary" onClick={() => go("reports", { what: "expenses" })}><Download size={16} /> {t("common.export")}</button>} />
      <ProfitChart db={db} selected={m} onSelect={setM} />
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-plum-dark to-plum px-5 py-4 text-white shadow-md">
        <div className="flex items-center gap-2">
          <button onClick={() => setM(prev)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 hover:bg-white/25" aria-label={tx("Previous month")}><ChevronLeft size={18} /></button>
          <strong className="min-w-[160px] text-center text-lg">{fmtMonth(m)}</strong>
          <button onClick={() => setM(addMonths(m, 1))} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 hover:bg-white/25" aria-label={tx("Next month")}><ChevronRight size={18} /></button>
          {!isThis && <button onClick={() => setM(monthStart(today))} className="ml-1 text-sm underline">{tx("This month")}</button>}
        </div>
        <div className="text-right"><span className="text-[13px] text-white/80">{t("exp.total")}</span><div className="text-[30px] font-extrabold leading-tight">{money(total)}</div>
          <span className="text-xs text-white/80">{prevTotal === 0 ? tx("Nothing recorded in {month}", { month: fmtMonth(prev) }) : diff === 0 ? tx("Same as {month}", { month: fmtMonth(prev, false) }) : tx(diff > 0 ? "{amount} more than {month}" : "{amount} less than {month}", { amount: money(Math.abs(diff)), month: fmtMonth(prev, false) })}</span></div>
      </div>

      <form onSubmit={save} className="card flex flex-col gap-4 p-5" noValidate>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-semibold">{editing ? tx("Edit expense") : t("exp.add")}</h2><span className="text-xs text-muted">{tx("Pick a group, then fill in the details")}</span></div>
        {error && <p role="alert" className="rounded-xl bg-danger-light px-4 py-3 text-sm text-danger">{error}</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {EXPENSE_CATS.map((k) => { const I = ICON[k]; const on = f.category === k; return (
            <button key={k} type="button" aria-pressed={on} onClick={() => setF({ ...f, category: k })} className={`flex h-11 items-center justify-center gap-2 rounded-[10px] text-sm ${on ? "font-semibold text-white shadow" : "border border-field bg-white"}`} style={on ? { background: EXPENSE_COLOR[k] } : undefined}><I size={16} style={on ? undefined : { color: EXPENSE_COLOR[k] }} /> {EXPENSE_LABEL[k]}</button>
          ); })}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <label className="label">{tx("What *")}<input className="input" list="exp-sugg" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={EXPENSE_HINT[f.category]} /><datalist id="exp-sugg">{sugg.map((s) => <option key={s} value={s} />)}</datalist></label>
          <label className="label">{tx("Amount (ETB) *")}<span className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">{tx("ETB")}</span><input className="input pl-12 font-semibold" inputMode="decimal" placeholder="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") })} /></span></label>
          <DateField label={tx("Date")} required value={f.spent_on || defDate} onChange={(v) => setF({ ...f, spent_on: v })} />
          <label className="label">{tx("Paid with")}<select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="cash">{tx("Cash")}</option><option value="telebirr">{tx("Telebirr")}</option><option value="cbe">{tx("CBE")}</option><option value="bank">{tx("Bank")}</option><option value="other">{tx("Other")}</option></select></label>
        </div>
        <div className="flex justify-end gap-2">
          {editing && <button type="button" className="btn btn-secondary" onClick={() => { setEditing(null); setF(blank); }}>{tx("Cancel")}</button>}
          <button className="btn bg-plum text-white hover:bg-plum-dark">{editing ? tx("Save changes") : t("exp.add")}</button>
        </div>
      </form>

      {total === 0 ? <div className="card"><Empty>{tx("Nothing recorded in {month} yet. Add the first expense above.", { month: fmtMonth(m) })}</Empty></div> : (
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        {EXPENSE_CATS.map((cat) => {
          const list = items.filter((e) => e.category === cat), sum = list.reduce((a, e) => a + Number(e.amount), 0), I = ICON[cat];
          return (
            <section key={cat} className="card flex flex-col overflow-hidden">
              <div className={`flex items-center justify-between gap-3 px-5 py-3.5 ${SOFT[cat]}`}>
                <span className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl text-white" style={{ background: EXPENSE_COLOR[cat] }}><I size={17} /></span><h2 className="text-base font-semibold">{t(`exp.${cat}` as "exp.rent")}</h2></span>
                <span className="text-right"><strong className="text-lg">{money(sum)}</strong><span className="block text-xs text-muted">{tx("{p}% of month", { p: total ? Math.round((sum / total) * 100) : 0 })}</span></span>
              </div>
              {list.length === 0 ? <p className="px-5 py-3 text-[13px] text-muted">{tx("Nothing recorded.")}</p> : <div className="px-5 pb-3 pt-3"><Bar pct={total ? (sum / total) * 100 : 0} color={EXPENSE_COLOR[cat]} />
                {list.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5 text-sm last:border-0">
                    <span className="min-w-0"><span className="block truncate">{e.description}</span><span className="text-xs text-muted">{fmtDate(e.spent_on)} · {METHODS[e.method] ?? e.method}</span></span>
                    <span className="flex flex-none items-center gap-1.5"><span className="whitespace-nowrap font-medium">{money(e.amount)}</span>
                      <button onClick={() => { setEditing(e); setF({ category: e.category, description: e.description, amount: String(e.amount), spent_on: e.spent_on, method: e.method, note: e.note }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-brand" aria-label={tx("Edit {name}", { name: e.description })}><Pencil size={14} /></button>
                      <ConfirmButton label="×" className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-muted hover:bg-danger-light hover:text-danger" confirmLabel={tx("Delete")} onConfirm={() => { update((d) => { d.expenses = d.expenses.filter((x) => x.id !== e.id); }, ["Deleted expense · {what} · {amount}", { what: e.description, amount: Number(e.amount) }]); toast(tx("Expense deleted")); }} />
                    </span>
                  </div>
                ))}
              </div>}
            </section>
          );
        })}
      </div>)}
    </div>
  );
}
