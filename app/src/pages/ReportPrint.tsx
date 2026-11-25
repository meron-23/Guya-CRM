import { tx } from "@/lib/tr";
import { ArrowLeft, Copy, Printer, Sheet } from "lucide-react";
import { downloadExcel } from "../xlsx";
import { useStore } from "../store";
import { useApp } from "../ui";
import { resolveRange } from "@/lib/range";
import { buildReport, toCSV, type Dataset, showCell } from "../report";
import { money, num } from "@/lib/format";

export default function ReportPrint() {
  const { db, me, isPartner } = useStore();
  const { go, route, toast } = useApp();
  const r = resolveRange(route.params.range, route.params.from, route.params.to);
  const include = ((route.params.what ?? "").split(",").filter(Boolean) as Dataset[]).filter((k) => isPartner || k !== "expenses");
  const { tables, summary } = buildReport(db, r.from, r.to, include);
  const stats: [string, string, string][] = !isPartner ? [[tx("Enquiries"), num(summary.leads), "bg-sky-light"], [tx("Calls made"), num(summary.calls), "bg-sky-light"], [tx("Assessments booked"), num(summary.assessments), "bg-leaf-light"], [tx("Registered"), num(summary.registrations), "bg-leaf-light"], [tx("Payments"), num(summary.payments), "bg-brand-light"], [tx("Reminders sent"), num(summary.reminders), "bg-gold-light"]] : [[tx("Enquiries"), num(summary.leads), "bg-sky-light"], [tx("Registered"), num(summary.registrations), "bg-leaf-light"], [tx("Payments"), num(summary.payments), "bg-brand-light"],
    [tx("Collected"), money(summary.collected), "bg-leaf-light"], [tx("Expenses"), money(summary.expenses), "bg-plum-light"], [tx("Profit"), money(summary.profit), "bg-gold-light"]];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="btn btn-secondary" onClick={() => go("reports")}><ArrowLeft size={16} /> {tx("Back to reports")}</button>
        <div className="flex flex-wrap gap-2">
        <button className="btn bg-leaf text-white" onClick={() => downloadExcel(db, r.from, r.to, r.label, include, me.full_name, isPartner).then(() => toast(tx("Excel file downloaded")), () => toast(tx("Could not create the Excel file")))}><Sheet size={16} /> {tx("Download Excel")}</button>
        <button className="btn btn-secondary" onClick={() => { try { window.print(); } catch { toast(tx("Printing isn't available here")); } }}><Printer size={16} /> {tx("Print / PDF")}</button>
        <button className="btn btn-secondary" onClick={() => navigator.clipboard?.writeText(toCSV(tables)).then(() => toast(tx("Copied — paste into Excel or Google Sheets")), () => toast(tx("Could not copy here")))}><Copy size={16} /> {tx("Copy as CSV")}</button>
        </div>
      </div>
      <div className="card flex flex-col gap-5 p-5 md:p-8">
        <header className="flex items-center justify-between gap-4 border-b border-line pb-4">
          <div><h1 className="text-2xl font-bold">{tx("Centre report")}</h1><p className="text-sm text-muted">{db.settings.branch_name} · {r.label}</p><p className="text-xs text-muted">{tx("Prepared by {name}", { name: me.full_name })}</p></div>
          <img src="./logo.png" alt={tx("Guya")} className="w-[130px]" />
        </header>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{stats.map(([k, v, bg]) => <div key={k} className={`rounded-xl p-3 ${bg}`}><div className="text-xs text-muted">{k}</div><div className="text-base font-bold">{v}</div></div>)}</section>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {summary.bySource.length > 0 && <section><h2 className="mb-1 text-sm font-semibold">{tx("Enquiries by source")}</h2>{summary.bySource.map(([k, v]) => <div key={k} className="flex justify-between border-b border-line-soft py-1.5 text-sm"><span>{k}</span><span>{v}</span></div>)}</section>}
          {isPartner && summary.byExpense.length > 0 && <section><h2 className="mb-1 text-sm font-semibold">{tx("Expenses by group")}</h2>{summary.byExpense.map(([k, v]) => <div key={k} className="flex justify-between border-b border-line-soft py-1.5 text-sm"><span>{k}</span><span>{money(v)}</span></div>)}</section>}
        </div>
        {tables.map((tb) => (
          <section key={tb.name}>
            <h2 className="mb-2 text-base font-semibold">{tb.name} <span className="font-normal text-muted">({tb.rows.length})</span></h2>
            {tb.rows.length === 0 ? <p className="text-sm text-muted">{tx("None in this period.")}</p> : (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full border-collapse text-xs">
                  <thead><tr>{tb.columns.map((c) => <th key={c} className="whitespace-nowrap bg-brand px-2.5 py-2 text-left font-semibold text-white">{c}</th>)}</tr></thead>
                  <tbody>{tb.rows.map((row, i) => <tr key={i} className={i % 2 ? "bg-canvas" : ""}>{row.map((v, j) => <td key={j} className="whitespace-nowrap px-2.5 py-1.5">{typeof v === "number" && /ETB|ብር/.test(tb.columns[j]) ? num(v) : showCell(v)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
