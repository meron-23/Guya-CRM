import { tl, tx } from "@/lib/tr";
import { CheckCircle2 } from "lucide-react";
import { useStore } from "../store";
import { ContactButtons, useApp } from "../ui";
import { fmtDate, fmtDateTime, fmtMonth, money } from "@/lib/format";
import { METHODS } from "@/lib/labels";
import { message } from "@/lib/messages";

export default function Receipt() {
  const { db } = useStore();
  const { go, route, lang } = useApp();
  const p = db.payments.find((x) => x.id === route.params.id);
  const c = db.children.find((x) => x.id === p?.child_id);
  if (!p || !c) return <p className="text-sm text-muted">{tx("Payment not found.")}</p>;
  const s = db.services.find((x) => x.id === p.service_id);
  const group = p.bundle ? db.payments.filter((x) => x.bundle === p.bundle).sort((a, b) => (a.period_month ?? "").localeCompare(b.period_month ?? "")) : [p];
  const total = group.reduce((a, x) => a + Number(x.amount), 0);
  const discount = group.reduce((a, x) => a + Number(x.discount ?? 0), 0);
  const period = group.length > 1 ? `${fmtMonth(group[0].period_month!)} – ${fmtMonth(group[group.length - 1].period_month!)}` : p.period_month && fmtMonth(p.period_month);
  const what = [s?.name ?? (p.period_month ? tx("Monthly fee") : null), period].filter(Boolean).join(", ");
  const msg = message("receipt", lang, { parent: p.payer_name || c.parent_name, child: c.name, amount: money(total), what, code: p.code, branch: db.settings.branch_name });
  const rows: [string, string][] = [
    [tl("Receipt no."), p.code], [tl("Child"), `${c.name} (${c.code})`], [tl("Paid by"), p.payer_name || c.parent_name], [tl("For"), what || "—"], ...(discount ? [[tl("Upfront discount"), `${money(discount)} (${tx("{n} months", { n: group.length })})`] as [string, string]] : []),
    [tl("Method"), `${METHODS[p.method] ?? p.method}${p.reference ? ` · ${p.reference}` : ""}`], [tl("Date paid"), fmtDate(p.paid_on, { weekday: true, year: true })],
    [tl("Received by"), db.profiles.find((x) => x.id === p.received_by)?.full_name ?? "—"], [tl("Recorded"), fmtDateTime(p.created_at)],
  ];
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      {route.params.fresh && <div className="flex items-center gap-3 rounded-2xl bg-leaf p-4 text-white"><CheckCircle2 size={22} /> <span className="font-semibold">{tx("Payment saved.")}</span> <span className="text-sm text-white/85">{tx("Send the receipt to the parent below.")}</span></div>}
      <article className="card overflow-hidden">
        <div className={`px-6 py-5 text-white ${p.voided ? "bg-body" : "bg-gradient-to-br from-brand to-leaf"}`}>
          <div className="text-xs uppercase tracking-wide text-white/75">{tx("Guya Special Need Therapy Center")} · {db.settings.branch_name}</div>
          <div className="mt-2 text-3xl font-extrabold">{money(total)}</div>
          <div className="text-sm text-white/80">{tx("Payment receipt")}{p.voided && ` — ${tx("VOIDED")}`}</div>
        </div>
        <dl className="px-6 py-3">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-line-soft py-2.5 text-sm last:border-0"><dt className="text-muted">{tx(k)}</dt><dd className="text-right font-medium">{v}</dd></div>)}
          {p.voided && <div className="py-2.5 text-sm text-danger">{tx("Voided: {reason}", { reason: p.void_reason ?? "" })}</div>}
        </dl>
        {p.screenshot && <div className="border-t border-line px-6 py-4"><span className="eyebrow">{tx("Payment screenshot")}</span><a href={p.screenshot} target="_blank" rel="noopener"><img src={p.screenshot} alt={tx("Payment screenshot")} className="mt-2 max-h-80 rounded-xl border border-line" /></a></div>}
      </article>
      {!p.voided && (
        <div className="card flex flex-col gap-3 p-5">
          <span className="eyebrow">{tx("Send receipt to {name}", { name: c.parent_name })}</span>
          <p className="rounded-xl bg-canvas p-3 text-[13px] leading-relaxed text-body">{msg}</p>
          <ContactButtons phone={c.phone} telegram={c.telegram} message={msg} />
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn btn-secondary" onClick={() => go("children", { open: c.id })}>{tx("Back to {name}", { name: c.name.split(" ")[0] })}</button>
        <button className="btn btn-primary" onClick={() => go("payment")}>{tx("Record another")}</button>
      </div>
    </div>
  );
}
