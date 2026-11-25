import { tx, txLang, txc, txd, txn, withLang } from "@/lib/tr";
import { useState } from "react";
import { Bell, Check, Copy, PhoneCall, CalendarCheck, HandCoins, ChevronDown } from "lucide-react";
import { useStore } from "../store";
import { ContactButtons, Empty, PageHeader, Tabs, useApp, type Tone, Avatar } from "../ui";
import { bucketOf, useBilling } from "../helpers";
import { dueDateFor } from "@/lib/billing";
import { addDays, dateInTZ, fmtDate, fmtDateTime, fmtMonth, fmtTime, money, monthStart } from "@/lib/format";
import { CHANNELS, SOURCES } from "@/lib/labels";
import { message } from "@/lib/messages";
import type { Lang } from "@/lib/i18n";
import type { Lead } from "@/lib/types";

type Card = { key: string; kind: "payment" | "call" | "assessment"; who: string; sub: string; what: string; when: string; urgent: boolean; phone: string; telegram: string; pref: string; msg: string; childId?: string; leadId?: string; done: boolean; open: () => void };
type Tab = "payments" | "calls" | "assessments" | "sent";

export default function Reminders() {
  const { db, rawDb, update, userId } = useStore();
  const { go, t, lang, toast, route } = useApp();
  const { rows, svc, today } = useBilling();
  const [msgLang, setMsgLang] = useState<Lang>(lang);
  const [channels, setChannels] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [showDone, setShowDone] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const S = db.settings;
  const tomorrow = addDays(today, 1);
  const thisDue = dueDateFor(monthStart(today), S.fee_due_day);
  const doneSet = new Set(db.reminders.filter((r) => dateInTZ(r.sent_at) === today).map((r) => `${r.kind}|${r.child_id ?? r.lead_id}`));

  const pays: { overdue: Card[]; soon: Card[] } = { overdue: [], soon: [] };
  for (const { c, b, s } of rows) {
    if (b.owes <= 0 || !b.remindFrom || b.remindFrom > today) continue;
    const msg = withLang(msgLang, () => message(b.late ? "paymentLate" : "paymentDue", msgLang, { parent: c.parent_name, child: c.name, month: b.arrears > 0 ? tx("{month} and earlier", { month: fmtMonth(today) }) : fmtMonth(today), amount: money(b.owes), due: fmtDate(thisDue), branch: txd(rawDb.settings.branch_name) }));
    (b.late ? pays.overdue : pays.soon).push({
      key: c.id, kind: "payment", who: c.relationship ? tx("{parent} — {relationship} of {child}", { parent: c.parent_name, relationship: c.relationship, child: c.name }) : `${c.parent_name} — ${c.name}`, sub: `${c.code} · ${tx("prefers {channel}", { channel: CHANNELS[c.preferred_channel] })}${b.paidThisMonth > 0 ? ` · ${tx("paid {amount} this month", { amount: money(b.paidThisMonth) })}` : ""}`,
      what: `${s?.name ?? tx("Fee")} · ${money(b.owes)}`, when: b.dueLabel, urgent: b.late, phone: c.phone, telegram: c.telegram, pref: c.preferred_channel, msg, childId: c.id, done: doneSet.has(`payment|${c.id}`), open: () => go("children", { open: c.id }),
    });
  }
  const leadCard = (l: Lead, kind: "call" | "assessment"): Card => {
    const isA = kind === "assessment", ad = dateInTZ(l.assessment_at);
    return {
      key: l.id, kind, who: isA ? `${l.parent_name}${l.child_name ? ` — ${l.child_name}` : ""}` : l.parent_name, sub: `${l.code} · ${SOURCES[l.source] ?? l.source}${l.child_age ? ` · ${tx("child {n} yrs", { n: l.child_age })}` : ""}`,
      what: isA ? tx("Assessment · {service}", { service: svc.get(l.service_id ?? "")?.name ?? tx("general") }) : `${tx("Call {n} of {max}", { n: l.call_attempts + 1, max: S.call_cadence.length })}${l.concern ? ` · ${l.concern}` : ""}`,
      when: isA ? `${ad === today ? t("common.today") : ad === tomorrow ? t("common.tomorrow") : fmtDate(ad, { weekday: true })} ${fmtTime(l.assessment_at)}` : bucketOf(l, today) === "overdue" ? tx("{date} · late", { date: fmtDate(dateInTZ(l.next_call_at)) }) : l.call_attempts === 0 ? tx("Within 1 hour") : t("common.today"),
      urgent: !isA && (bucketOf(l, today) === "overdue" || l.call_attempts === 0), phone: l.phone, telegram: l.telegram, pref: l.preferred_channel,
      msg: withLang(msgLang, () => isA ? message("assessment", msgLang, { parent: l.parent_name, child: l.child_name || tx("your child"), date: ad === today ? tx("today") : ad === tomorrow ? tx("tomorrow") : fmtDate(ad, { weekday: true }), time: fmtTime(l.assessment_at), branch: txd(rawDb.settings.branch_name) })
        : message("leadFollowUp", msgLang, { parent: l.parent_name, branch: txd(rawDb.settings.branch_name) })),
      leadId: l.id, done: doneSet.has(`${kind}|${l.id}`), open: () => go("leads", { tab: isA ? "assessment" : bucketOf(l, today) ?? "today", open: l.id }),
    };
  };
  const callsOver = db.leads.filter((l) => bucketOf(l, today) === "overdue").map((l) => leadCard(l, "call"));
  const callsToday = db.leads.filter((l) => bucketOf(l, today) === "today").map((l) => leadCard(l, "call"));
  const ass = db.leads.filter((l) => l.status === "assessment_booked").sort((a, b) => (a.assessment_at ?? "").localeCompare(b.assessment_at ?? ""));
  const aSoon = ass.filter((l) => [today, tomorrow].includes(dateInTZ(l.assessment_at))).map((l) => leadCard(l, "assessment"));
  const aLater = ass.filter((l) => dateInTZ(l.assessment_at) > tomorrow).map((l) => leadCard(l, "assessment"));
  const aMissed = ass.filter((l) => dateInTZ(l.assessment_at) < today).map((l) => ({ ...leadCard(l, "assessment"), when: tx("{date} · update the lead", { date: fmtDate(dateInTZ(l.assessment_at)) }), urgent: true }));
  const counts = { payments: pays.overdue.length + pays.soon.length, calls: callsOver.length + callsToday.length, assessments: aSoon.length + aMissed.length };
  const [tab, setTab] = useState<Tab>((route.params.tab as Tab) ?? (counts.payments ? "payments" : counts.calls ? "calls" : "payments"));

  let groups: { title: string; cards: Card[]; tone: string }[] = [];
  if (tab === "payments") groups = [{ title: tx("Overdue"), cards: pays.overdue, tone: "text-warn" }, { title: tx("Due {date}", { date: fmtDate(thisDue) }), cards: pays.soon, tone: "text-brand" }];
  if (tab === "calls") groups = [{ title: tx("Overdue"), cards: callsOver, tone: "text-warn" }, { title: tx("Due today"), cards: callsToday, tone: "text-sky" }];
  if (tab === "assessments") groups = [{ title: tx("Missed — needs an update"), cards: aMissed, tone: "text-warn" }, { title: tx("Today & tomorrow"), cards: aSoon, tone: "text-leaf" }, { title: tx("Later"), cards: aLater, tone: "text-muted" }];
  const doneCards = groups.flatMap((g) => g.cards.filter((c) => c.done));
  groups = groups.map((g) => ({ ...g, cards: g.cards.filter((c) => !c.done) })).filter((g) => g.cards.length);
  const allToday = [...pays.overdue, ...pays.soon, ...callsOver, ...callsToday, ...aSoon, ...aMissed];
  const doneToday = allToday.filter((c) => c.done).length;
  const EDGE = { payment: "border-l-amber", call: "border-l-sky", assessment: "border-l-leaf" };
  const names = new Map(db.profiles.map((p) => [p.id, p.full_name]));
  const log = [...db.reminders].sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  const toName = (r: (typeof log)[number]) => { const c = db.children.find((x) => x.id === r.child_id); const l = db.leads.find((x) => x.id === r.lead_id); return c ? `${c.parent_name} (${c.name})` : l?.parent_name ?? "—"; };
  const tabTone: Record<Tab, Tone> = { payments: "amber", calls: "sky", assessments: "leaf", sent: "slate" };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={Bell} tone="amber" title={t("rem.title")} subtitle={tx("{date} · built automatically from payments, leads and assessments", { date: fmtDate(today, { weekday: true, year: true }) })} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={tx("Today's reminders")}>
        {([["payments", tx("Payments to remind"), counts.payments, HandCoins, "bg-amber"], ["calls", tx("Calls to make"), counts.calls, PhoneCall, "bg-sky"], ["assessments", tx("Assessments"), counts.assessments, CalendarCheck, "bg-leaf"]] as const).map(([k, l, n, I, bg]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-3 rounded-2xl p-4 text-left text-white shadow-md transition hover:-translate-y-0.5 ${bg} ${tab === k ? "ring-4 ring-offset-2 ring-offset-canvas" : ""}`} style={tab === k ? { ["--tw-ring-color" as string]: "rgba(23,41,45,.25)" } : undefined}>
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-white/20"><I size={21} /></span>
            <span><strong className="block text-[28px] font-extrabold leading-none">{n}</strong><span className="text-[13px] text-white/90">{l}</span></span>
          </button>
        ))}
        <div className="flex flex-col justify-center gap-2 rounded-2xl border border-line bg-white p-4">
          <span className="flex items-baseline justify-between"><span className="text-[13px] font-medium text-body">{tx("Done today")}</span><strong className="text-lg">{doneToday} / {allToday.length}</strong></span>
          <div className="h-2.5 overflow-hidden rounded-full bg-line-soft"><div className="h-2.5 rounded-full bg-leaf transition-all" style={{ width: `${allToday.length ? (doneToday / allToday.length) * 100 : 100}%` }} /></div>
          <span className="text-xs text-muted">{allToday.length - doneToday === 0 ? tx("All done for today ✓") : tx("{n} still to send", { n: allToday.length - doneToday })}</span>
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<Tab> value={tab} onChange={setTab} items={[
          { key: "payments", label: t("rem.payments"), count: counts.payments, tone: tabTone.payments }, { key: "calls", label: t("rem.calls"), count: counts.calls, tone: tabTone.calls },
          { key: "assessments", label: t("rem.assessments"), count: counts.assessments, tone: tabTone.assessments }, { key: "sent", label: t("rem.sent"), count: log.length, tone: tabTone.sent }]} />
        {tab !== "sent" && (
          <div className="flex items-center gap-2 text-[13px] text-muted">{tx("Message language:")}
            {(["am", "en"] as const).map((l) => <button key={l} onClick={() => setMsgLang(l)} aria-pressed={msgLang === l} className={`chip h-8 px-3 ${msgLang === l ? "border-transparent bg-ink font-semibold text-white" : ""}`}>{l === "am" ? "አማርኛ" : tx("English")}</button>)}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {tab !== "sent" && groups.length === 0 && <div className="card"><Empty>{doneCards.length ? tx("Everything here is done for today. ✓") : tx("Nothing to send here right now. ✓")}</Empty></div>}
          {groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-3">
              <span className={`eyebrow pt-1 ${g.tone}`}>{g.title} · {g.cards.length}</span>
              {g.cards.map((c) => (
                <article key={c.key + c.kind} className={`card overflow-hidden border-l-4 ${EDGE[c.kind]} ${c.done ? "opacity-70" : ""}`}>
                  <header className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-3 md:px-5">
                    <Avatar name={c.who} size={38} />
                    <div className="min-w-0 flex-1">
                      <button onClick={c.open} className="block text-left text-[15px] font-semibold leading-snug hover:text-brand">{c.who}</button>
                      <span className="text-xs text-muted">{c.sub}</span>
                    </div>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="pill bg-canvas text-ink">{c.what}</span>
                      <span className={`pill ${c.urgent ? "bg-amber-light text-warn-dark" : "bg-brand-light text-brand-dark"}`}>{c.when}</span>
                      {c.done && <span className="pill bg-leaf text-white"><Check size={12} /> {t("rem.done")}</span>}
                    </span>
                  </header>
                  <div className="flex flex-col gap-4 p-4 md:flex-row md:p-5">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor={`msg-${c.key}`}>{tx("Message")} <span className="font-normal normal-case tracking-normal">· {tx("you can edit it")}</span></label>
                      <textarea id={`msg-${c.key}`} rows={3} value={edits[c.key + msgLang] ?? c.msg} onChange={(e) => setEdits({ ...edits, [c.key + msgLang]: e.target.value })} className="w-full resize-y rounded-[10px] border border-line bg-canvas px-3 py-2.5 text-[13px] leading-relaxed text-body focus:border-brand focus:bg-white" />
                      <button type="button" onClick={() => navigator.clipboard?.writeText(edits[c.key + msgLang] ?? c.msg).then(() => toast(tx("Message copied")), () => {})} className="inline-flex items-center gap-1 self-end text-xs font-medium text-brand hover:underline"><Copy size={12} /> {tx("Copy message")}</button>
                    </div>
                    <div className="flex w-full flex-none flex-col gap-3 md:w-[310px]">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-muted">1 · {tx("Contact them")}</span>
                        <ContactButtons phone={c.phone} telegram={c.telegram} message={edits[c.key + msgLang] ?? c.msg} compact />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-muted">2 · {tx("How did you reach them?")}</span>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label={tx("How did you reach them?")}>
                          {([["call", tx("Call")], ["whatsapp", "WhatsApp"], ["telegram", "Telegram"], ["sms", "SMS"], ["in_person", tx("In person")]] as const).map(([k, l]) => {
                            const on = (channels[c.key] ?? c.pref) === k;
                            return <button key={k} type="button" aria-pressed={on} onClick={() => setChannels({ ...channels, [c.key]: k })} className={`h-8 rounded-full px-3 text-xs ${on ? "bg-ink font-semibold text-white" : "border border-field bg-white text-body hover:border-ink"}`}>{l}</button>;
                          })}
                        </div>
                        <input className="input h-9 text-[13px]" placeholder={tx("What did they say? (optional)")} value={notes[c.key] ?? ""} onChange={(e) => setNotes({ ...notes, [c.key]: e.target.value })} aria-label={tx("Result note")} />
                      </div>
                      <button className="btn btn-green h-10 w-full" onClick={() => { update((d) => { d.reminders.push({ id: crypto.randomUUID(), kind: c.kind, child_id: c.childId ?? null, lead_id: c.leadId ?? null, channel: channels[c.key] ?? c.pref, message: edits[c.key + msgLang] ?? c.msg, result: (notes[c.key] ?? "").trim(), sent_by: userId, sent_at: new Date().toISOString() }); }); toast(tx("Marked as done")); }}><Check size={16} /> {tx("Done — I reached them")}</button>
                      {c.kind === "call" && <button onClick={c.open} className="text-center text-xs font-medium text-sky hover:underline">{tx("Log the call outcome on the lead →")}</button>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ))}
          {tab !== "sent" && doneCards.length > 0 && (
            <div className="card overflow-hidden">
              <button onClick={() => setShowDone((v) => !v)} className="flex w-full items-center justify-between bg-leaf-light px-5 py-3 text-left text-sm font-semibold text-leaf-dark" aria-expanded={showDone}>
                <span className="flex items-center gap-2"><Check size={16} /> {tx("Done today")} · {doneCards.length}</span><ChevronDown size={16} className={showDone ? "rotate-180" : ""} />
              </button>
              {showDone && doneCards.map((c) => (
                <div key={c.key + c.kind} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-5 py-2.5 text-sm">
                  <button onClick={c.open} className="text-left font-medium hover:text-brand">{c.who}</button><span className="text-muted">{c.what}</span>
                </div>
              ))}
            </div>
          )}
          {tab === "sent" && (
            <section className="card overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-canvas text-left"><tr>{[tx("When"), txc("col", "To"), txc("col", "About"), tx("Channel"), tx("Note"), txc("col", "By")].map((h) => <th key={h} className="eyebrow px-4 py-2.5">{h}</th>)}</tr></thead>
                <tbody>
                  {log.length === 0 && <tr><td colSpan={6}><Empty>{tx("No reminders logged yet.")}</Empty></td></tr>}
                  {log.map((r) => (
                    <tr key={r.id} className="border-t border-line-soft">
                      <td className="whitespace-nowrap px-4 py-2.5">{fmtDateTime(r.sent_at)}</td><td className="px-4 py-2.5">{toName(r)}</td><td className="px-4 py-2.5">{txc("badge", r.kind === "payment" ? "Payment" : r.kind === "call" ? "Call" : "Assessment")}</td>
                      <td className="px-4 py-2.5">{CHANNELS[r.channel] ?? r.channel.replace("_", " ")}</td><td className="px-4 py-2.5 text-muted">{r.result || "—"}</td><td className="px-4 py-2.5">{names.get(r.sent_by ?? "") ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
        <aside className="card flex w-full flex-none flex-col gap-3 p-5 text-[13px] leading-relaxed lg:sticky lg:top-6 lg:w-[290px]">
          <h2 className="text-base font-semibold">{tx("When reminders appear")}</h2>
          <div className="rounded-xl bg-amber-light p-3"><strong className="text-warn-dark">{tx("Payments")}</strong><br />{txn(S.reminder_days_before, "From 1 day before the due date (day {due} of the month), until paid.", "From {n} days before the due date (day {due} of the month), until paid.", { due: S.fee_due_day })}</div>
          <div className="rounded-xl bg-sky-light p-3"><strong className="text-sky">{tx("Lead calls")}</strong><br />{S.call_cadence.map((d, i) => (i === 0 ? tx("within 1 hour") : tx("day {d}", { d }))).join(txLang() === "am" ? "፣ " : ", ")}. {tx("After {n} missed calls the lead closes.", { n: S.call_cadence.length })}</div>
          <div className="rounded-xl bg-leaf-light p-3"><strong className="text-leaf-dark">{tx("Assessments")}</strong><br />{tx("The day before and on the day.")}</div>
          <p className="text-xs text-muted">{tx(
            "WhatsApp opens the chat with the message written. Telegram copies the message so you can paste it. “Done — I reached them” lets partners see it was sent."
          )}</p>
        </aside>
      </div>
    </div>
  );
}
