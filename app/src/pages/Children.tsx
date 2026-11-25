import { tl, tx, txn } from "@/lib/tr";
import { useState } from "react";
import { ChevronDown, Download, Pencil, Plus, Search, Users, X, Check } from "lucide-react";
import { expectedFor, useStore, covered } from "../store";
import { Avatar, Bar, ContactButtons, Empty, PageHeader, PayPill, Tabs, useApp } from "../ui";
import { useBilling } from "../helpers";
import type { PayStatus } from "@/lib/billing";
import { addMonths, ageFromDob, fmtDate, fmtMonth, money, monthStart, num } from "@/lib/format";
import { CHANNELS, METHODS } from "@/lib/labels";

const SVC_TONE: Record<string, string> = { "s-aba": "bg-brand-light text-brand-dark", "s-speech": "bg-leaf-light text-leaf-dark", "s-ot": "bg-amber-light text-warn-dark", "s-day": "bg-plum-light text-plum-dark" };
type Group = "current" | "therapy" | "daycare" | "assessment" | "waiting" | "left";

export default function Children() {
  const { db, update, isPartner } = useStore();
  const { go, t, toast, route } = useApp();
  const { rows, today } = useBilling();
  const [group, setGroup] = useState<Group>("current");
  const [pay, setPay] = useState<PayStatus | undefined>();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null | undefined>(route.params.open);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [view, setView] = useState<"list" | "service" | "therapist" | "age">("list");
  type Row = (typeof rows)[number];
  const GCOL = ["#1f6e7f", "#35633f", "#b8651f", "#6b55a0", "#2f7fa6", "#c99a2e", "#b04040"];
  const groupsOf = (xs: Row[]): { title: string; color: string; items: Row[] }[] => {
    if (view === "list") return [{ title: "", color: "", items: xs }];
    const m = new Map<string, Row[]>();
    const add = (k: string, r: Row) => m.set(k, [...(m.get(k) ?? []), r]);
    for (const r of xs) {
      if (view === "service") (r.services.length ? r.services : [{ name: tx("No service") }]).forEach((x) => add(x.name, r));
      else if (view === "therapist") add(r.th ? `${r.th.name}${r.th.specialty ? ` — ${r.th.specialty}` : ""}` : tx("No therapist yet"), r);
      else { const a = parseInt(ageFromDob(r.c.date_of_birth) || "-1", 10); add(a < 0 ? tx("Age not recorded") : a <= 3 ? tx("Under 4 years") : a <= 6 ? tx("4 – 6 years") : a <= 9 ? tx("7 – 9 years") : tx("10 years and over"), r); }
    }
    const order = view === "age" ? [tx("Under 4 years"), tx("4 – 6 years"), tx("7 – 9 years"), tx("10 years and over"), tx("Age not recorded")] : [...m.keys()].sort();
    return order.filter((k) => m.has(k)).map((k, i) => ({ title: k, color: GCOL[i % GCOL.length], items: m.get(k)! }));
  };

  const inGroup = (r: (typeof rows)[number]) => {
    switch (group) {
      case "therapy": return r.c.status === "active" && r.services.some((x) => x.category === "therapy");
      case "daycare": return r.c.status === "active" && r.services.some((x) => x.category === "daycare");
      case "assessment": return r.c.status !== "left" && r.services.some((x) => x.category === "assessment");
      case "waiting": return r.c.status === "waiting";
      case "left": return r.c.status === "left";
      default: return r.c.status !== "left";
    }
  };
  const term = q.trim().toLowerCase();
  const base = rows.filter(inGroup);
  const order: Record<PayStatus, number> = { unpaid: 0, partial: 1, paid: 2, none: 3 };
  const list = (term ? rows.filter((r) => [r.c.name, r.c.parent_name, r.c.phone, r.c.code].some((v) => v.toLowerCase().includes(term))) : base.filter((r) => !pay || r.b.status === pay))
    .sort((a, b) => order[a.b.status] - order[b.b.status] || b.b.owes - a.b.owes || a.c.name.localeCompare(b.c.name));
  const open = openId === null ? undefined : list.find((r) => r.c.id === openId) ?? (openId === undefined ? list[0] : undefined);
  const count = (s?: PayStatus) => base.filter((r) => !s || r.b.status === s).length;
  const label = (s: PayStatus) => s === "paid" ? t("children.paid") : s === "partial" ? t("children.partial") : s === "unpaid" ? t("children.unpaid") : "—";
  const BAR = { paid: "#35633f", partial: "#b8651f", unpaid: "#b04040", none: "#c9d6d9" };
  const CARDS = [
    { key: undefined, label: t("children.all"), n: count(), color: "#1f6e7f", bg: "bg-brand-light", sub: group === "left" ? tx("Left the centre") : tx("Active and waiting") },
    { key: "paid" as const, label: t("children.paid"), n: count("paid"), color: "#35633f", bg: "bg-leaf-light", sub: tx("Nothing owed") },
    { key: "partial" as const, label: t("children.partial"), n: count("partial"), color: "#b8651f", bg: "bg-amber-light", sub: tx("Balance still owed") },
    { key: "unpaid" as const, label: t("children.unpaid"), n: count("unpaid"), color: "#b04040", bg: "bg-danger-light", sub: tx("Needs a reminder") },
  ];
  const people = new Map(db.profiles.map((p) => [p.id, p.full_name]));
  const svcName = new Map(db.services.map((s) => [s.id, s.name]));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={Users} tone="leaf" title={t("children.title")} subtitle={tx("{month} · families who still owe are shown first", { month: fmtMonth(today) })}
        actions={<>
          <label className="relative"><span className="sr-only">{t("common.search")}</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input className="input h-11 w-[210px] pl-9 pr-8 text-sm" value={q} onChange={(e) => { setQ(e.target.value); setOpenId(undefined); }} placeholder={tx("Child, parent, phone, GU-")} />
            {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted" aria-label={tx("Clear search")}><X size={15} /></button>}
          </label>
          {isPartner && <button className="btn btn-secondary" onClick={() => go("reports", { what: "payments" })}><Download size={16} /> {t("common.export")}</button>}
          <button className="btn btn-green" onClick={() => go("child-form")}><Plus size={16} /> {t("children.add")}</button>
        </>} />

      {term ? <p className="text-sm text-muted">{txn(list.length, "1 result for “{q}”", "{n} results for “{q}”", { q })}</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" role="group" aria-label={tx("Filter by payment")}>
            {CARDS.map((p) => {
              const on = pay === p.key;
              return (
                <button key={p.label} aria-pressed={on} onClick={() => { setPay(p.key); setOpenId(undefined); }}
                  className={`relative flex flex-col items-start gap-1.5 overflow-hidden rounded-2xl px-4 pb-3.5 pt-4 text-left transition ${on ? "text-white shadow-md" : "border border-line bg-white hover:-translate-y-0.5 hover:shadow-sm"}`} style={on ? { background: p.color } : undefined}>
                  {!on && <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: p.color }} />}
                  <span className="flex w-full items-center justify-between gap-2 text-[13px] font-semibold" style={on ? undefined : { color: p.color }}>{p.label}{on && <Check size={15} aria-hidden />}</span>
                  <strong className="text-[30px] font-extrabold leading-none">{p.n}</strong>
                  <span className={`text-xs ${on ? "text-white/85" : "text-muted"}`}>{p.sub}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="card flex flex-wrap items-center justify-between gap-3 p-2.5">
        {!term && <div className="min-w-0"><Tabs<Group> value={group} onChange={(k) => { setGroup(k); setPay(undefined); setOpenId(undefined); }}
            items={[{ key: "current", label: "All" }, { key: "therapy", label: "Therapy", tone: "brand" }, { key: "daycare", label: "Day care", tone: "plum" }, { key: "assessment", label: "Assessment", tone: "gold" }, { key: "waiting", label: t("children.waiting"), tone: "sky" }, { key: "left", label: t("children.left"), tone: "slate" }]} /></div>}
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-medium text-muted">{tx("Group by")}</span>
          <div className="flex rounded-[10px] bg-canvas p-1" role="group" aria-label={tx("Group by")}>
            {([["list", tl("No grouping")], ["service", tl("Service")], ["therapist", tl("Therapist")], ["age", tl("Age")]] as const).map(([k, l]) => (
              <button key={k} aria-pressed={view === k} onClick={() => setView(k)} className={`h-8 rounded-lg px-3 ${view === k ? "bg-white font-semibold text-ink shadow-sm" : "text-body hover:text-ink"}`}>{tx(l)}</button>
            ))}
          </div>
        </div>
      </div>
      <section className="card overflow-hidden" aria-label={tx("Children")}>
        <div className="hidden items-center gap-4 border-b border-line bg-canvas px-5 py-3 lg:flex">
          <span className="eyebrow w-[230px]">{tx("Child")}</span><span className="eyebrow w-[150px]">{t("children.parent")}</span><span className="eyebrow w-[200px]">{t("children.service")}</span>
          <span className="eyebrow w-[190px]">{t("children.thisMonth")}</span><span className="eyebrow flex-1">{t("children.nextPayment")}</span>
        </div>
        {list.length === 0 && <Empty>{tx("No children match this filter.")}</Empty>}
        {groupsOf(list).map((grp) => (<div key={grp.title}>{grp.title && <div className="flex items-center gap-2 border-b border-line bg-canvas px-5 py-2.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: grp.color }} /><span className="text-sm font-semibold">{grp.title}</span><span className="text-xs text-muted">{grp.items.length}</span></div>}{grp.items.map(({ c, b, th, services }) => {
          const isOpen = open?.c.id === c.id;
          const history = isOpen ? db.payments.filter((p) => p.child_id === c.id).sort((a, x) => x.paid_on.localeCompare(a.paid_on) || x.created_at.localeCompare(a.created_at)) : [];
          const tiles: { m: string; label: string; tone: string }[] = [];
          if (isOpen && b.status !== "none" && c.status !== "waiting") {
            const paidBy = new Map<string, number>();
            history.filter((p) => !p.voided && p.period_month).forEach((p) => paidBy.set(p.period_month!, (paidBy.get(p.period_month!) ?? 0) + covered(p)));
            for (let i = -3; i <= 1; i++) {
              const m = addMonths(today, i);
              if (m < monthStart(c.joined_on)) continue;
              const paid = paidBy.get(m) ?? 0, fee = expectedFor(c, m), future = m > monthStart(today);
              const st = paid >= fee ? tl("Paid") : paid > 0 ? tl("Part paid") : future ? tl("Upcoming") : tl("Not paid");
              tiles.push({ m: fmtMonth(m, false), label: fee !== Number(c.monthly_fee) && m === monthStart(c.joined_on) ? `${tx(st)} · ${num(fee)}` : tx(st), tone: st === "Paid" ? "bg-leaf text-white" : st === "Part paid" ? "bg-amber text-white" : st === "Upcoming" ? "bg-white text-muted border border-line" : "bg-rose text-white" });
            }
          }
          return (
            <div key={c.id} className={`border-b border-line-soft last:border-0 ${isOpen ? "bg-leaf-light/50" : ""}`}>
              <button onClick={() => { setOpenId(isOpen ? null : c.id); setVoiding(null); }} aria-expanded={isOpen}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left hover:bg-leaf-light/40 lg:flex-nowrap lg:px-5">
                <span className="flex min-w-0 flex-[1_1_calc(100%-48px)] items-center gap-3 lg:w-[230px] lg:flex-none">
                  <Avatar name={c.name} active={isOpen} />
                  <span className="flex min-w-0 flex-col"><strong className="truncate text-[15px]">{c.name}</strong><span className="text-xs text-muted">{c.code}{ageFromDob(c.date_of_birth) && ` · ${ageFromDob(c.date_of_birth)}`}</span></span>
                </span>
                <span className="hidden w-[150px] truncate text-sm lg:block">{c.parent_name}</span>
                <span className="hidden w-[200px] flex-col items-start gap-1 lg:flex">
                  <span className="flex flex-wrap gap-1">{services.length ? services.map((x) => <span key={x.id} className={`rounded-md px-2 py-0.5 text-xs font-semibold ${SVC_TONE[x.id] ?? "bg-gold-light text-[#7a5a12]"}`}>{x.name}</span>) : <span className="text-sm text-muted">—</span>}</span>
                  <span className="text-xs text-muted">{th ? tx("with {name}", { name: th.name }) : c.status === "waiting" ? t("children.waiting") : ""}</span>
                </span>
                <span className="order-2 ml-[52px] flex w-[150px] flex-col gap-1.5 lg:order-none lg:ml-0 lg:w-[190px]">
                  <span className="flex items-center justify-between gap-2"><PayPill status={b.status} label={label(b.status)} />{b.status !== "none" && <span className="text-xs text-body">{num(b.paidThisMonth)} / {num(b.fee)}</span>}</span>
                  {b.status !== "none" && <Bar h={6} pct={b.fee > 0 ? (b.paidThisMonth / b.fee) * 100 : 0} color={BAR[b.status]} />}
                </span>
                <span className={`order-2 flex-1 text-sm font-medium lg:order-none ${b.late ? "text-warn" : "text-body"}`}>{b.dueLabel}</span>
                <ChevronDown size={18} className={`order-1 text-muted transition lg:order-none ${isOpen ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {isOpen && (
                <div className="mx-3 mb-4 flex flex-wrap overflow-hidden rounded-2xl border border-[#bcd9c3] shadow-[0_8px_22px_rgba(53,99,63,0.13)] lg:mx-4">
                  <div className="flex w-full flex-col gap-4 bg-gradient-to-b from-brand to-brand-dark p-5 text-white md:w-[290px]">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-white/65">{t("children.parent")}</span>
                      <div className="mt-1 text-base font-semibold leading-snug">{c.parent_name}{c.relationship && <span className="font-normal text-white/75"> · {c.relationship}</span>}</div>
                      <div className="mt-0.5 font-mono text-[13px] text-white/85">{c.phone}</div>
                      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px]">{tx("Prefers")}: <strong>{CHANNELS[c.preferred_channel]}</strong></span>
                    </div>
                    <ContactButtons dark stacked phone={c.phone} telegram={c.telegram} />
                    <dl className="flex flex-col gap-2 border-t border-white/20 pt-3.5 text-[13px]">
                      {([
                        [tx("Age"), c.date_of_birth ? `${ageFromDob(c.date_of_birth)} · ${fmtDate(c.date_of_birth, { year: true })}` : "—"],
                        [tx("Therapist"), th?.name ?? tx("Not assigned")],
                        [tx("Schedule"), c.schedule || "—"],
                        [tx("Joined"), fmtDate(c.joined_on, { year: true })],
                        ...(c.second_contact_name || c.second_contact_phone ? [[tx("Second contact"), `${c.second_contact_name} ${c.second_contact_phone}`.trim()]] : []),
                        ...(c.left_on ? [[tx("Left"), fmtDate(c.left_on, { year: true })]] : []),
                      ] as [string, string][]).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-white/65">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
                    </dl>
                    {c.notes && <p className="rounded-xl bg-white/10 p-3 text-[13px] leading-relaxed text-white/90">{c.notes}</p>}
                    {c.lead_id && <button className="mt-auto self-start text-xs text-white/75 underline hover:text-white" onClick={() => go("leads", { open: c.lead_id! })}>{tx("See the original enquiry")}</button>}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-3.5 bg-mint p-4 md:p-5">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className={`flex flex-col gap-1 rounded-xl border-l-4 bg-white p-4 ${b.owes > 0 ? "border-amber" : "border-leaf"}`}>
                        <span className="text-xs text-muted">{t("children.owesNow")}</span>
                        <strong className={`text-2xl ${b.owes > 0 ? "text-warn" : "text-leaf-dark"}`}>{money(b.owes)}</strong>
                        {b.arrears > 0 && <span className="text-xs text-warn">{tx("incl. {amount} from earlier months", { amount: money(b.arrears) })}</span>}
                        {b.status !== "none" && <span className="text-xs text-body">{tx("This month: {paid} of {fee}", { paid: money(b.paidThisMonth), fee: money(b.fee) })}</span>}
                      </div>
                      <div className="flex flex-col gap-1 rounded-xl border-l-4 border-brand bg-white p-4">
                        <span className="text-xs text-muted">{t("children.plan")}</span><strong className="text-[15px]">{services.map((x) => x.billing === "per_session" || x.billing === "per_hour" ? `${x.name} (${tx(x.billing === "per_hour" ? "{n} hrs/mo" : "{n} sessions/mo", { n: c.service_qty?.[x.id] ?? 8 })})` : x.name).join(" + ") || "—"}</strong>
                        <span className="text-xs text-body">{[c.schedule, th && tx("with {name}", { name: th.name }), b.status !== "none" && tx("{amount}/month", { amount: money(c.monthly_fee) }), c.first_month_fee != null && tx("first month {amount}", { amount: money(c.first_month_fee) })].filter(Boolean).join(" · ") || "—"}</span>
                      </div>
                      <div className="flex flex-col gap-1 rounded-xl border-l-4 border-sky bg-white p-4">
                        <span className="text-xs text-muted">{t("children.nextPayment")}</span><strong className="text-[15px]">{b.status === "none" ? "—" : b.owes > 0 ? money(b.owes) : money(b.fee)}</strong>
                        <span className={`text-xs ${b.late ? "text-warn" : "text-body"}`}>{b.dueLabel}</span>
                      </div>
                    </div>
                    {tiles.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{tx("Month by month")}</span>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{tiles.map((x) => <span key={x.m} className={`flex flex-col rounded-xl px-3 py-2 ${x.tone}`}><span className="text-[13px] font-semibold">{x.m}</span><span className="text-[11px] opacity-90">{x.label}</span></span>)}</div>
                      </div>
                    )}
                    <div className="rounded-xl bg-white p-4">
                      <div className="mb-1.5 text-[13px] font-semibold">{t("children.history")}</div>
                      {history.length === 0 && <p className="py-2 text-[13px] text-muted">{tx("No payments yet.")}</p>}
                      {history.map((p) => (
                        <div key={p.id} className={`group flex flex-wrap items-center gap-3 border-t border-line-soft py-2.5 text-[13px] first:border-0 ${p.voided ? "opacity-60" : ""}`}>
                          <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg text-[11px] font-bold ${p.voided ? "bg-canvas text-muted" : "bg-leaf-light text-leaf-dark"}`} aria-hidden>{p.screenshot ? "📷" : "✓"}</span>
                          <button className="min-w-0 flex-1 text-left hover:text-brand" onClick={() => go("receipt", { id: p.id })}>
                            <span className={`block ${p.voided ? "line-through" : "font-semibold"}`}>{p.period_month ? fmtMonth(p.period_month) : tx("One-time")} <span className="font-normal text-body">· {svcName.get(p.service_id ?? "") ?? tx("Monthly fee")}</span></span>
                            <span className="block text-xs text-muted">{fmtDate(p.paid_on, { year: true })} · <span className="rounded bg-canvas px-1.5 py-0.5 font-medium text-body">{METHODS[p.method] ?? p.method}</span>{p.reference && ` ${p.reference}`} · {p.code} · {tx("by {name}", { name: people.get(p.received_by ?? "") ?? "—" })}</span>
                            {p.screenshot && <span className="sr-only"> · {tx("screenshot")}</span>}
                            {!!p.discount && <span className="mt-0.5 block text-xs font-medium text-leaf-dark">🏷 {tx("Paid {n} months upfront · {amount} discount", { n: p.bundle_months ?? 1, amount: money(p.discount) })}</span>}
                            {p.voided && <span className="block text-xs text-danger">{tx("Voided: {reason}", { reason: p.void_reason ?? "" })}</span>}
                          </button>
                          <span className="flex items-center gap-3">
                            <strong className={`whitespace-nowrap text-sm ${p.voided ? "line-through" : ""}`}>{money(p.amount)}</strong>
                            {isPartner && !p.voided && voiding !== p.id && <button className="rounded-lg px-2 py-1 text-xs text-muted opacity-60 hover:bg-danger-light hover:text-danger group-hover:opacity-100" onClick={() => { setVoiding(p.id); setReason(""); }}>{tx("Void")}</button>}
                          </span>
                          {voiding === p.id && (
                            <form className="flex w-full flex-wrap items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); if (!reason.trim()) return; update((d) => { d.payments.filter((y) => y.id === p.id || (p.bundle && y.bundle === p.bundle)).forEach((x) => { x.voided = true; x.void_reason = reason.trim(); }); }, ["Payment {code} voided: {reason}", { code: p.code, reason: reason.trim() }]); setVoiding(null); toast(tx("Payment voided")); }}>
                              <input className="input h-9 flex-1 text-xs" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tx("Reason, e.g. entered twice")} aria-label={tx("Reason for voiding")} autoFocus />
                              <button className="btn btn-danger btn-sm" disabled={!reason.trim()}>{tx("Void payment")}</button>
                              <button type="button" className="text-xs text-muted" onClick={() => setVoiding(null)}>{tx("Cancel")}</button>
                            </form>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button className="btn btn-secondary" onClick={() => go("child-form", { id: c.id })}><Pencil size={15} /> {t("common.edit")}</button>
                      <button className="btn btn-primary" onClick={() => go("payment", { child: c.id })}><Plus size={16} /> {t("pay.record")}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}</div>))}
      </section>
    </div>
  );
}
