import { tx, txLang, txc, txn } from "@/lib/tr";
import { useState } from "react";
import { Bell, Download, Eye, EyeOff, LayoutGrid, Lock, PhoneCall, TrendingUp, UserPlus, Users, Wallet, Coins, HandCoins, ChevronRight } from "lucide-react";
import { useStore } from "../store";
import { Bar, PageHeader, TONE, useApp, type Tone } from "../ui";
import { RangeBar } from "../RangeBar";
import { bucketOf, inRange, useBilling } from "../helpers";
import { resolveRange, type RangeKey } from "@/lib/range";
import { addDays, dateInTZ, fmtDate, fmtDateTime, fmtTime, money } from "@/lib/format";
import { SOURCES } from "@/lib/labels";

export default function Dashboard() {
  const { db, me, isPartner } = useStore();
  const { go, t } = useApp();
  const [range, setRange] = useState<RangeKey>("month");
  const [dates, setDates] = useState<{ from?: string; to?: string }>({});
  const [showMoney, setShowMoney] = useState(false);
  const r = resolveRange(range, dates.from, dates.to, "month");
  const { rows, svc, today } = useBilling();

  const active = rows.filter((x) => x.c.status === "active");
  const waiting = rows.filter((x) => x.c.status === "waiting").length;
  const late = rows.filter((x) => x.b.late && x.b.owes > 0);
  const owed = rows.reduce((a, x) => a + x.b.owes, 0);
  const callsToday = db.leads.filter((l) => bucketOf(l, today) === "today");
  const callsOverdue = db.leads.filter((l) => bucketOf(l, today) === "overdue");
  const tomorrow = addDays(today, 1);
  const assessSoon = db.leads.filter((l) => l.status === "assessment_booked" && [today, tomorrow].includes(dateInTZ(l.assessment_at)));
  const enquiries = db.leads.filter((l) => inRange(dateInTZ(l.created_at), r.from, r.to));
  const registered = enquiries.filter((l) => l.status === "registered").length;
  const collected = db.payments.filter((p) => !p.voided && inRange(p.paid_on, r.from, r.to)).reduce((a, p) => a + Number(p.amount), 0);
  const spent = db.expenses.filter((e) => inRange(e.spent_on, r.from, r.to)).reduce((a, e) => a + Number(e.amount), 0);

  const src = new Map<string, { n: number; reg: number }>();
  enquiries.forEach((l) => { const e = src.get(l.source) ?? { n: 0, reg: 0 }; e.n++; if (l.status === "registered") e.reg++; src.set(l.source, e); });
  const sources = [...src.entries()].sort((a, b) => b[1].n - a[1].n);
  const bySvc = new Map<string, number>();
  active.forEach((x) => (x.services.length ? x.services : [{ name: tx("No service") }]).forEach((sv) => bySvc.set(sv.name, (bySvc.get(sv.name) ?? 0) + 1)));
  const svcRows = [...bySvc.entries()].sort((a, b) => b[1] - a[1]);
  const COLORS = ["#1f6e7f", "#35633f", "#b8651f", "#6b55a0", "#2f7fa6", "#c99a2e"];

  type Todo = { kind: "Call" | "Payment" | "Visit"; text: string; tag: string; urgent: boolean; onClick: () => void };
  const todo: Todo[] = [
    ...callsOverdue.map((l) => ({ kind: "Call" as const, text: tx("{name} — call {n}", { name: l.parent_name, n: l.call_attempts + 1 }), tag: tx("{date} · late", { date: fmtDate(dateInTZ(l.next_call_at)) }), urgent: true, onClick: () => go("leads", { tab: "overdue", open: l.id }) })),
    ...callsToday.map((l) => ({ kind: "Call" as const, text: tx("{name} — call {n}", { name: l.parent_name, n: l.call_attempts + 1 }), tag: l.call_attempts === 0 ? tx("New") : tx("Today"), urgent: l.call_attempts === 0, onClick: () => go("leads", { tab: "today", open: l.id }) })),
    ...assessSoon.map((l) => ({ kind: "Visit" as const, text: tx("{name} — assessment", { name: l.child_name || l.parent_name }), tag: `${dateInTZ(l.assessment_at) === today ? t("common.today") : t("common.tomorrow")} ${fmtTime(l.assessment_at)}`, urgent: false, onClick: () => go("reminders", { tab: "assessments" }) })),
    ...late.map(({ c, b }) => ({ kind: "Payment" as const, text: `${c.name} — ${money(b.owes)}`, tag: b.dueLabel, urgent: true, onClick: () => go("reminders", { tab: "payments" }) })),
  ];
  const BADGE = { Call: "bg-sky-light text-sky", Payment: "bg-amber-light text-warn-dark", Visit: "bg-leaf-light text-leaf-dark" };
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", hour: "numeric" }).format(new Date()));
  const greet = hour < 12 ? tx("Good morning") : hour < 17 ? tx("Good afternoon") : tx("Good evening");

  const kpis: { icon: typeof Users; label: string; value: number; sub: string; tone: Tone; onClick: () => void }[] = [
    { icon: Users, label: t("dash.activeChildren"), value: active.length, sub: tx("{n} on waiting list", { n: waiting }), tone: "leaf", onClick: () => go("children") },
    { icon: UserPlus, label: t("dash.newEnquiries"), value: enquiries.length, sub: tx("{n} registered", { n: registered }), tone: "sky", onClick: () => go("leads") },
    { icon: PhoneCall, label: t("dash.callsToday"), value: callsToday.length, sub: callsOverdue.length ? tx("+{n} overdue", { n: callsOverdue.length }) : tx("Nothing overdue"), tone: "brand", onClick: () => go("leads", { tab: "today" }) },
    { icon: Bell, label: t("dash.overduePayments"), value: late.length, sub: late.length ? txn(late.length, "1 family to remind", "{n} families to remind") : tx("Everyone is up to date"), tone: late.length ? "amber" : "leaf", onClick: () => go("reminders", { tab: "payments" }) },
  ];
  const profit = collected - spent;
  const moneyCards: { label: string; value: string; note: string; tone: Tone; icon: typeof Users }[] = [
    { label: t("dash.collected"), value: money(collected), note: tx("Payments received in this period"), tone: "leaf", icon: Coins },
    { label: t("dash.stillOwed"), value: money(owed), note: tx("Fees due and not yet paid (today)"), tone: "amber", icon: HandCoins },
    { label: t("dash.expenses"), value: money(spent), note: tx("Rent, salaries, utilities, misc."), tone: "plum", icon: Wallet },
    { label: t("dash.profit"), value: money(profit), note: tx("Collected minus expenses"), tone: profit < 0 ? "rose" : "brand", icon: TrendingUp },
  ];
  const names = new Map(db.profiles.map((p) => [p.id, p.full_name]));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={LayoutGrid} tone="brand" eyebrow={`${greet}${txLang() === "am" ? "፣" : ","} ${me.full_name.split(" ")[0]}`} title={t("dash.title")} subtitle={r.label}
        actions={isPartner && <button className="btn btn-secondary" onClick={() => go("reports")}><Download size={16} /> {t("common.export")}</button>} />
      <RangeBar value={r.key} onChange={setRange} from={r.from} to={r.to} onDates={(from, to) => setDates({ from, to })} />

      <section className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4" aria-label={tx("Centre numbers")}>
        {kpis.map((k) => (
          <button key={k.label} onClick={k.onClick} className={`group relative flex flex-col overflow-hidden rounded-2xl text-left text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg ${TONE[k.tone].solid}`}>
            <span aria-hidden className="absolute -bottom-10 -right-6 h-32 w-32 rounded-full bg-white/[0.07]" />
            <span className="flex items-center gap-2.5 px-4 pt-4 md:px-5">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white/20"><k.icon size={18} aria-hidden /></span>
              <span className="text-[13px] font-medium leading-tight text-white/90">{k.label}</span>
            </span>
            <strong className="px-4 pb-3 pt-3 text-[40px] font-extrabold leading-none md:px-5">{k.value}</strong>
            <span className="mt-auto flex items-center justify-between gap-2 border-t border-white/15 bg-black/10 px-4 py-2.5 text-[13px] text-white/90 md:px-5">
              <span className="truncate">{k.sub}</span>
              <ChevronRight size={16} aria-hidden className="flex-none opacity-70 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
            </span>
          </button>
        ))}
      </section>

      {isPartner && (
        <section className="card flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold"><Lock size={16} aria-hidden /> {t("dash.money")} <span className="pill bg-ink text-white">{t("common.partnersOnly")}</span></h2>
            {showMoney && <button onClick={() => setShowMoney(false)} className="btn btn-secondary btn-sm"><EyeOff size={15} /> {t("dash.hide")}</button>}
          </div>
          {showMoney ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {moneyCards.map((m) => (
                <div key={m.label} className={`flex flex-col gap-1 rounded-2xl border-l-4 p-4 ${TONE[m.tone].soft} ${TONE[m.tone].ring}`}>
                  <span className={`flex items-center gap-1.5 text-[13px] font-medium ${TONE[m.tone].text}`}><m.icon size={15} /> {m.label}</span>
                  <strong className="text-[22px] leading-tight">{m.value}</strong>
                  <span className="text-xs text-body">{m.note}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-canvas p-4">
              <span className="text-sm text-body">{t("dash.moneyHidden")}</span>
              <button onClick={() => setShowMoney(true)} className="btn btn-primary"><Eye size={16} /> {t("dash.showMoney")}</button>
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-amber-light px-5 py-3">
            <h2 className="text-base font-semibold text-warn-dark">{t("dash.todo")} <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs">{todo.length}</span></h2>
            <button onClick={() => go("reminders")} className="text-[13px] font-medium text-warn-dark underline-offset-2 hover:underline">{t("dash.openReminders")}</button>
          </div>
          <div className="px-5 py-1.5">
            {todo.length === 0 && <p className="py-6 text-sm text-muted">{t("dash.allDone")}</p>}
            {todo.slice(0, 8).map((x, i) => (
              <button key={i} onClick={x.onClick} className="flex w-full items-center gap-3 border-b border-line-soft py-2.5 text-left text-sm last:border-0 hover:text-brand">
                <span className={`w-[68px] flex-none rounded-md py-1 text-center text-[11px] font-bold uppercase tracking-wide ${BADGE[x.kind]}`}>{txc("badge", x.kind)}</span>
                <span className="min-w-0 flex-1 truncate">{x.text}</span>
                <span className={`whitespace-nowrap text-[13px] font-semibold ${x.urgent ? "text-warn" : "text-brand"}`}>{x.tag}</span>
              </button>
            ))}
            {todo.length > 8 && <button onClick={() => go("reminders")} className="py-2.5 text-[13px] text-brand">{tx("+{n} more", { n: todo.length - 8 })}</button>}
          </div>
        </section>
        <section className="card flex flex-col overflow-hidden">
          <h2 className="border-b border-line bg-leaf-light px-5 py-3 text-base font-semibold text-leaf-dark">{t("dash.byService")}</h2>
          <div className="flex flex-col gap-1 px-5 py-3">
            {svcRows.length === 0 && <p className="py-6 text-sm text-muted">{t("common.nothing")}</p>}
            {svcRows.map(([name, n], i) => (
              <div key={name} className="flex flex-col gap-1.5 py-1.5">
                <div className="flex justify-between text-sm"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{name}</span><strong>{n}</strong></div>
                <Bar pct={(n / Math.max(1, svcRows[0][1])) * 100} color={COLORS[i % COLORS.length]} />
              </div>
            ))}
          </div>
        </section>
        <section className="card flex flex-col overflow-hidden">
          <h2 className="border-b border-line bg-sky-light px-5 py-3 text-base font-semibold text-sky">{t("dash.sources")}</h2>
          <div className="flex flex-col gap-1 px-5 py-3">
            {sources.length === 0 && <p className="py-6 text-sm text-muted">{tx("No enquiries in this period.")}</p>}
            {sources.map(([s, v], i) => (
              <div key={s} className="flex flex-col gap-1.5 py-1.5">
                <div className="flex justify-between text-sm"><span>{SOURCES[s] ?? s}</span><span className="text-[13px] text-body">{txn(v.n, "1 enquiry", "{n} enquiries")}{v.reg ? ` · ${tx("{n} registered", { n: v.reg })}` : ""}</span></div>
                <Bar pct={(v.n / Math.max(1, sources[0][1].n)) * 100} color={["#2f7fa6", "#5eb1c3", "#6b55a0", "#c99a2e", "#4f8a5b"][i % 5]} />
              </div>
            ))}
          </div>
        </section>
      </div>

      {isPartner && (
        <section className="card p-5">
          <h2 className="mb-2 text-base font-semibold">{t("dash.activity")}</h2>
          {db.activity.slice(0, 8).map((a) => (
            <div key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-line-soft py-2.5 text-sm last:border-0">
              <span>{tx(a.summary, a.vars && Object.fromEntries(Object.entries(a.vars).map(([k, v]) => [k, k === "amount" ? money(v) : v])))}</span><span className="text-muted">{names.get(a.actor ?? "") ?? tx("System")} · {fmtDateTime(a.created_at)}</span>
            </div>
          ))}
        </section>
      )}
      <p className="sr-only">{tx("{n} services", { n: svc.size })}</p>
    </div>
  );
}
