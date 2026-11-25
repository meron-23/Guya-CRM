import { tl, tx, txMap } from "@/lib/tr";
import { DateField } from "../DateField";
import { useState } from "react";
import { Check, Copy, FileDown, FileText, Sheet, Send, UserPlus, Baby, Wallet, Receipt, Bell, PhoneCall, ClipboardList, type LucideIcon } from "lucide-react";
import { bucketOf, useBilling } from "../helpers";
import { useStore } from "../store";
import { PageHeader, TONE, useApp, type Tone } from "../ui";
import { resolveRange, type RangeKey } from "@/lib/range";
import { buildReport, datasetsFor, DATASET_LABEL, reportMessage, toCSV, type Dataset } from "../report";
import { downloadExcel } from "../xlsx";
import { money, monthStart, todayISO } from "@/lib/format";

export default function Reports() {
  const { db, update, me, isPartner } = useStore();
  const DATASETS = datasetsFor(isPartner);
  const { rows: billRows } = useBilling();
  type Per = "today" | "week" | "lastWeek" | "month" | "lastMonth";
  const [wk, setWk] = useState<Per>("today");
  const PERIODS: [Per, string, string][] = [["today", tx("Today"), tx("Daily report")], ["week", tx("This week"), tx("Weekly report")], ["lastWeek", tx("Last week"), tx("Weekly report")], ["month", tx("This month"), tx("Monthly report")], ["lastMonth", tx("Last month"), tx("Monthly report")]];
  const perTitle = PERIODS.find((x) => x[0] === wk)![2];
  const wr = resolveRange(wk);
  const overdue = db.leads.filter((l) => bucketOf(l) === "overdue").length;
  const owing = billRows.filter((x) => x.b.owes > 0).length;
  const weeklyMsg = reportMessage(db, wr.from, wr.to, wr.label, me.full_name, isPartner, overdue, owing, perTitle.toLowerCase());
  const [sent, setSent] = useState<string | null>(null);
  const { go, t, route, toast } = useApp();
  const [what, setWhat] = useState<Dataset[]>(route.params.what ? [route.params.what as Dataset] : ["leads", "calls", "registrations", "payments"]);
  const [range, setRange] = useState<RangeKey>("month");
  const [from, setFrom] = useState(monthStart(todayISO()));
  const [to, setTo] = useState(todayISO());
  const quick: { key: RangeKey; label: string; tone: Tone }[] = [{ key: "week", label: tl("Weekly"), tone: "sky" }, { key: "month", label: tl("Monthly"), tone: "leaf" }, { key: "year", label: tl("Yearly"), tone: "gold" }];
  const r = resolveRange(range, from, to);
  const open = (rk: RangeKey, w: Dataset[]) => go("report-print", { range: rk, from, to, what: w.join(",") });
  async function excel(rk: RangeKey, w: Dataset[]) {
    const rr = resolveRange(rk, from, to);
    try { await downloadExcel(db, rr.from, rr.to, rr.label, w, me.full_name, isPartner); toast(tx("Excel file downloaded")); }
    catch { toast(tx("Could not create the Excel file")); }
  }
  function create() {
    if (fmt === "excel") return void excel(range, what);
    if (fmt === "csv") {
      const blob = new Blob(["\ufeff" + toCSV(buildReport(db, r.from, r.to, what).tables)], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${tx("Guya report — {period}", { period: r.label })}.csv`; document.body.appendChild(a); a.click(); a.remove();
      return toast(tx("CSV file downloaded"));
    }
    open(range, what);
  }
  const S = db.settings;
  const [fmt, setFmt] = useState<"excel" | "csv" | "pdf">("excel");
  const all = buildReport(db, r.from, r.to, [...DATASETS]);
  const counts = DATASETS.map((k) => ({ k, n: all.tables.find((x) => x.name === DATASET_LABEL[k])?.rows.length ?? 0 }));


  const WeeklyCard = () => (
    <section className="card overflow-hidden" aria-label={tx("Report to partners")}>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-sky to-brand px-5 py-4 text-white md:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20"><ClipboardList size={20} /></span>
          <div><h2 className="text-lg font-semibold">{tx("Report to partners")}</h2><p className="text-[13px] text-white/85">{isPartner ? tx("The daily, weekly or monthly summary staff send you — you can send it too.") : tx("Pick the day, week or month and send it to Amman and Sara. It fills itself in.")}</p></div>
        </div>
        <div className="flex flex-wrap gap-1 rounded-[10px] bg-white/15 p-1" role="group" aria-label={tx("Report period")}>
          {PERIODS.map(([k, l]) => <button key={k} aria-pressed={wk === k} onClick={() => setWk(k)} className={`h-8 rounded-lg px-3 text-[13px] ${wk === k ? "bg-white font-semibold text-brand" : "text-white hover:bg-white/10"}`}>{l}</button>)}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 p-5 md:p-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-3">
          <span className="eyebrow">{perTitle} · {wr.label}</span>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {(() => { const s = buildReport(db, wr.from, wr.to, []).summary; return ([[tx("Enquiries"), s.leads, UserPlus, "bg-sky-light text-sky"], [tx("Calls made"), s.calls, PhoneCall, "bg-sky-light text-sky"], [tx("Assessments booked"), s.assessments, ClipboardList, "bg-leaf-light text-leaf-dark"], [tx("Registered"), s.registrations, Baby, "bg-leaf-light text-leaf-dark"], [tx("Payments"), s.payments, Wallet, "bg-brand-light text-brand-dark"], [tx("Reminders sent"), s.reminders, Bell, "bg-amber-light text-warn-dark"]] as const).map(([l, v, I, c]) => (
              <div key={l} className={`flex flex-col gap-1 rounded-xl p-3 ${c}`}><span className="flex items-center gap-1.5 text-xs font-medium"><I size={14} /> {l}</span><strong className="text-2xl text-ink">{v}</strong></div>
            )); })()}
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <button className="btn bg-leaf text-white" onClick={() => excel(wk, DATASETS.filter((k) => k !== "expenses" || isPartner))}><Sheet size={16} /> {tx("Download Excel")}</button>
            <button className="btn btn-secondary" onClick={() => open(wk, [...DATASETS])}><FileText size={16} /> {tx("View full report")}</button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="eyebrow">{tx("Message to send")}</span>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-canvas p-4 font-sans text-[13px] leading-relaxed text-body">{weeklyMsg}</pre>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" onClick={() => navigator.clipboard?.writeText(weeklyMsg).then(() => { setSent(wr.label); toast(tx("Report copied — paste it in the partners' Telegram group")); }, () => toast(tx("Could not copy here")))}><Copy size={16} /> {tx("Copy for Telegram")}</button>
            <a className="btn btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(weeklyMsg)}`} target="_blank" rel="noopener" onClick={() => setSent(wr.label)}>{tx("Send on WhatsApp")}</a>
            {sent === wr.label && <span className="inline-flex items-center gap-1 text-[13px] font-medium text-leaf-dark"><Check size={15} /> {tx("Ready to paste")}</span>}
          </div>
          <p className="text-xs text-muted">{tx("Attach the Excel file to the message for the full details.")}</p>
        </div>
      </div>
    </section>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={FileDown} tone="gold" title={t("rep.title")} subtitle={isPartner ? tx("Leads, registrations, payments and expenses for any week, month or year") : tx("Send the weekly report to the partners, or download any report you need")} />
      <WeeklyCard />
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-label={tx("Quick reports")}>
        {quick.map((q) => {
          const qr = resolveRange(q.key); const s = buildReport(db, qr.from, qr.to, []).summary;
          return (
            <article key={q.key} className="card flex flex-col overflow-hidden">
              <div className={`flex items-center justify-between px-5 py-3 ${TONE[q.tone].solid}`}><strong className="text-base">{tx(q.label)}</strong><span className="text-xs text-white/85">{qr.label}</span></div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[13px]">
                  {(isPartner ? [[tx("Enquiries"), s.leads], [tx("Registered"), s.registrations], [tx("Collected"), money(s.collected)], [tx("Expenses"), money(s.expenses)]] : [[tx("Enquiries"), s.leads], [tx("Calls made"), s.calls], [tx("Registered"), s.registrations], [tx("Reminders sent"), s.reminders]]).map(([k, v]) => <span key={k} className="flex flex-col"><span className="text-muted">{k}</span><strong className="text-[15px]">{v}</strong></span>)}
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <button className="btn btn-secondary btn-sm" onClick={() => open(q.key, [...DATASETS])}><FileText size={15} /> {tx("View")}</button>
                  <button className="btn btn-sm bg-leaf text-white" onClick={() => excel(q.key, [...DATASETS])}><Sheet size={15} /> {tx("Excel")}</button>
                </div>
              </div>
            </article>
          );
        })}
      </section>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <section className="card flex min-w-0 flex-[3] flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line-soft bg-gold-light px-5 py-4 md:px-6">
            <div><h2 className="text-lg font-semibold">{tx("Build your own report")}</h2><p className="text-[13px] text-[#5c4410]">{tx("Three steps: pick what, pick when, pick the file type.")}</p></div>
          </div>
          <div className="flex flex-col gap-6 p-5 md:p-6">
            <div className="flex flex-col gap-2.5">
              <Step n={1} title={tx("What do you want in the report?")} hint={tx(
                "Tick one or more. The number shows how many rows each will have for the period you pick."
              )} />
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {DATASETS.map((k) => { const on = what.includes(k); const n = counts.find((x) => x.k === k)?.n ?? 0; const I = ICON[k]; return (
                  <button key={k} aria-pressed={on} onClick={() => setWhat(on ? what.filter((x) => x !== k) : [...what, k])} className={`flex items-start gap-3 rounded-xl border-2 p-3 text-left transition ${on ? "border-gold bg-gold-light" : "border-line bg-white hover:border-field"}`}>
                    <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-md border-2 ${on ? "border-gold bg-gold text-white" : "border-field"}`}>{on && <Check size={13} strokeWidth={3} />}</span>
                    <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="flex items-center gap-1.5 text-sm"><I size={15} className="text-muted" />{DATASET_LABEL[k]}</strong><span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-body shadow-sm">{n}</span></span><span className="text-xs text-muted">{DESC[k]}</span></span>
                  </button>
                ); })}
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <Step n={2} title={tx("Which dates?")} hint={tx("Selected: {period}", { period: r.label })} />
              <div className="flex flex-wrap gap-1.5">
                {([["today", tx("Today")], ["week", tx("This week")], ["month", tx("This month")], ["lastMonth", tx("Last month")], ["year", tx("This year")], ["custom", tx("Pick dates")]] as const).map(([k, l]) => <button key={k} aria-pressed={range === k} onClick={() => setRange(k)} className={`chip ${range === k ? "border-transparent bg-ink font-semibold text-white" : ""}`}>{l}</button>)}
              </div>
              {range === "custom" && (
                <div className="flex flex-wrap gap-3">
                  <div className="w-full sm:w-60"><DateField small required label={tx("From")} value={from} max={to} onChange={(v) => v && setFrom(v)} /></div>
                  <div className="w-full sm:w-60"><DateField small required label={tx("To")} value={to} min={from} onChange={(v) => v && setTo(v)} /></div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2.5">
              <Step n={3} title={tx("What kind of file?")} />
              <div className="grid grid-cols-3 gap-2">
                {([["excel", tx("Excel"), tx("One sheet per section")], ["csv", "CSV", tx("Opens anywhere")], ["pdf", "PDF", tx("To print or share")]] as const).map(([k, l, d]) => (
                  <button key={k} aria-pressed={fmt === k} onClick={() => setFmt(k)} className={`rounded-xl border-2 px-3 py-2.5 text-left ${fmt === k ? "border-brand bg-brand-light" : "border-line bg-white hover:border-field"}`}><strong className="block text-sm">{l}</strong><span className="text-xs text-muted">{d}</span></button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-4">
              <span className="eyebrow">{tx("Your report")}</span>
              {what.length ? (
                <p className="text-sm text-body"><strong>{FMT_LABEL[fmt]}</strong> · {r.label} · {counts.filter((x) => what.includes(x.k)).map((x) => `${DATASET_LABEL[x.k]}: ${x.n}`).join(", ")}</p>
              ) : <p className="text-sm font-medium text-rose">{tx("Tick at least one thing in step 1.")}</p>}
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary" disabled={!what.length} onClick={create}><FileDown size={16} /> {fmt === "pdf" ? tx("Open to print") : tx(fmt === "excel" ? "Download Excel" : "Download CSV")}</button>
                <button className="btn btn-secondary" disabled={!what.length} onClick={() => open(range, what)}><FileText size={16} /> {tx("Preview on screen")}</button>
              </div>
              <p className="text-xs text-muted">{tx(
                "Excel files come in Guya's colours with your logo: a summary page first, then one sheet for each thing you ticked."
              )}</p>
            </div>
          </div>
        </section>
        {isPartner && <section className="card flex flex-[2] flex-col gap-3 p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Send size={16} className="text-sky" /> {tx("Send automatically")}</h2>
          {([["auto_weekly_report", tx("Weekly summary every Monday"), tx("Sent to both partners on Telegram")], ["auto_monthly_report", tx("Monthly summary on the 1st"), tx("Last month's full summary")]] as const).map(([field, label, sub]) => {
            const on = S[field];
            return (
              <div key={field} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-sm">{label}<br /><span className="text-xs text-muted">{sub}</span></span>
                <button role="switch" aria-checked={on} aria-label={label} onClick={() => { update((d) => { d.settings[field] = !on; }); toast(on ? tx("Turned off") : tx("Turned on")); }} className={`relative h-7 w-12 flex-none rounded-full transition ${on ? "bg-leaf" : "bg-field"}`}>
                  <span className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-all ${on ? "left-[23px]" : "left-[3px]"}`} />
                </button>
              </div>
            );
          })}
        </section>}
      </div>
    </div>
  );
}

const ICON: Record<Dataset, LucideIcon> = { calls: PhoneCall, leads: UserPlus, registrations: Baby, payments: Wallet, expenses: Receipt, reminders: Bell };
const DESC: Record<Dataset, string> = txMap({ calls: "Every call made to a lead: when, outcome, note and who called", leads: "Every enquiry logged: parent, phone, source, status, calls made", registrations: "Children who joined: services, therapist, fee, start date", payments: "Money received: receipt, child, month, amount, method", expenses: "Rent, salaries, utilities and other costs (partners only)", reminders: "Payment and call reminders that were sent, and by whom" });
const FMT_LABEL = txMap({ excel: "Excel file", csv: "CSV file", pdf: "PDF" });
function Step({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-ink text-sm font-bold text-white">{n}</span>
      <span><strong className="block text-[15px]">{title}</strong>{hint && <span className="text-xs text-muted">{hint}</span>}</span>
    </div>
  );
}
