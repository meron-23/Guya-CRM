import { tl, tx, txLang, txn } from "@/lib/tr";
import { DateField } from "../DateField";
import { useState } from "react";
import { Download, Pencil, PhoneCall, Plus, Search, X } from "lucide-react";
import { logLeadCall, useStore } from "../store";
import { Avatar, ConfirmButton, ContactButtons, Empty, PageHeader, Tabs, useApp, type Tone } from "../ui";
import { bucketOf, type LeadBucket } from "../helpers";
import { addDays, addisToUTC, dateInTZ, fmtDate, fmtDateTime, fmtTime, todayISO } from "@/lib/format";
import { CLOSE_REASONS, OUTCOMES, SOURCES } from "@/lib/labels";
import { message } from "@/lib/messages";
import type { Lead } from "@/lib/types";

type LeadTab = "all" | "logged" | LeadBucket;
const TABS: { key: LeadTab; label: string; hint: string; tone: Tone }[] = [
  { key: "all", label: tl("All leads"), hint: tl("Every enquiry, newest first"), tone: "brand" },
  { key: "logged", label: tl("Today's logs"), hint: tl("Enquiries that came in today"), tone: "plum" },
  { key: "today", label: tl("Call today"), hint: tl("Calls due today, by the follow-up plan"), tone: "sky" },
  { key: "overdue", label: tl("Overdue"), hint: tl("Calls that should already have happened"), tone: "amber" },
  { key: "assessment", label: tl("Assessment booked"), hint: tl("Waiting for their assessment visit"), tone: "leaf" },
  { key: "closed", label: tl("Closed"), hint: tl("No response, out of area, not interested…"), tone: "slate" },
];
const STATUS_PILL: Record<string, [string, string]> = {
  new: [tl("New — call now"), "bg-plum-light text-plum-dark"], today: [tl("Call today"), "bg-sky-light text-sky"], overdue: [tl("Overdue"), "bg-amber-light text-warn-dark"],
  upcoming: [tl("Waiting for next call"), "bg-brand-light text-brand-dark"], assessment: [tl("Assessment booked"), "bg-leaf-light text-leaf-dark"],
  closed: [tl("Closed"), "bg-canvas text-body"], registered: [tl("Registered ✓"), "bg-leaf text-white"],
};
const SRC_TONE: Record<string, string> = { tiktok: "bg-plum-light text-plum-dark", facebook: "bg-sky-light text-sky", instagram: "bg-danger-light text-danger", referral: "bg-leaf-light text-leaf-dark", doctor: "bg-gold-light text-[#7a5a12]", walk_in: "bg-amber-light text-warn-dark" };

export default function Leads() {
  const { db, update, isPartner, userId } = useStore();
  const { go, t, lang, toast, route } = useApp();
  const today = todayISO();
  const [tab, setTab] = useState<LeadTab>((route.params.tab as LeadTab) ?? "all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | undefined>(route.params.open);
  const [mode, setMode] = useState<null | "answered" | "book">(null);
  const [note, setNote] = useState("");
  const [nextDate, setNextDate] = useState(addDays(today, 2));
  const [aDate, setADate] = useState(addDays(today, 1));
  const [aTime, setATime] = useState("10:00");

  const svcName = new Map(db.services.map((s) => [s.id, s.name]));
  const interests = (l: { service_ids?: string[]; service_id: string | null }) => (l.service_ids?.length ? l.service_ids : l.service_id ? [l.service_id] : []).map((id) => svcName.get(id)).filter(Boolean).join(" + ");
  const inTab = (l: Lead, k: LeadTab) => k === "all" ? true : k === "logged" ? dateInTZ(l.created_at) === today : bucketOf(l, today) === k;
  const counts = Object.fromEntries(TABS.map((x) => [x.key, db.leads.filter((l) => inTab(l, x.key)).length])) as Record<LeadTab, number>;
  const stateOf = (l: Lead) => l.status === "registered" ? "registered" : l.status === "open" && l.call_attempts === 0 && bucketOf(l, today) !== "overdue" && bucketOf(l, today) !== "upcoming" ? "new" : bucketOf(l, today) ?? "closed";
  const term = q.trim().toLowerCase();
  let rows: Lead[] = term
    ? db.leads.filter((l) => [l.parent_name, l.child_name, l.phone, l.code].some((v) => v.toLowerCase().includes(term)))
    : db.leads.filter((l) => inTab(l, tab));
  rows = [...rows].sort((a, b) => tab === "assessment" ? (a.assessment_at ?? "").localeCompare(b.assessment_at ?? "") : tab === "all" || tab === "logged" || tab === "closed" || term ? b.created_at.localeCompare(a.created_at) : (a.next_call_at ?? "").localeCompare(b.next_call_at ?? ""));
  const sel = rows.find((l) => l.id === openId) ?? db.leads.find((l) => l.id === openId && !!term) ?? rows[0];
  const calls = sel ? db.leadCalls.filter((c) => c.lead_id === sel.id).sort((a, b) => a.called_at.localeCompare(b.called_at)) : [];
  const cad = db.settings.call_cadence, max = cad.length;

  const nextLabel = (l: Lead) => {
    if (l.status === "assessment_booked") return `${fmtDate(dateInTZ(l.assessment_at), { weekday: true })}, ${fmtTime(l.assessment_at)}`;
    if (l.status === "closed") return CLOSE_REASONS[l.close_reason ?? "other"] ?? tx("Closed");
    if (l.status === "registered") return tx("Registered");
    const d = dateInTZ(l.next_call_at), n = l.call_attempts + 1, isLast = n >= max;
    const call = isLast ? tx("Call {n} (last)", { n }) : tx("Call {n}", { n });
    if (d < today) return tx("{call} · {date} (late)", { call, date: fmtDate(d) });
    if (d === today) return l.call_attempts === 0 ? tx("Call 1 · within 1 hr") : tx("{call} · today", { call });
    return `${call} · ${fmtDate(d, { weekday: true })}`;
  };
  const nextColor = (l: Lead) => l.status === "closed" ? "text-muted" : l.status === "assessment_booked" || l.status === "registered" ? "text-leaf" : bucketOf(l, today) === "overdue" || l.call_attempts === 0 ? "text-warn" : "text-sky";

  function log(outcome: string) {
    if (!sel) return;
    update((d) => logLeadCall(d, sel.id, outcome, note.trim(), userId,
      outcome === "answered" ? addisToUTC(nextDate, "09:00") : undefined,
      outcome === "booked_assessment" ? addisToUTC(aDate, aTime) : undefined));
    setNote(""); setMode(null);
    toast(outcome === "booked_assessment" ? tx("Assessment booked") : outcome === "no_answer" ? tx("Saved — next call scheduled") : tx("Call saved"));
  }
  const headTone = !sel ? "bg-brand" : sel.status === "closed" ? "bg-body" : sel.status === "assessment_booked" || sel.status === "registered" ? "bg-leaf" : bucketOf(sel, today) === "overdue" ? "bg-amber" : "bg-sky";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={PhoneCall} tone="sky" title={t("leads.title")} subtitle={t("leads.subtitle")}
        actions={<>
          {isPartner && <button className="btn btn-secondary" onClick={() => go("reports", { what: "leads" })}><Download size={16} /> {t("common.export")}</button>}
          <button className="btn btn-primary" onClick={() => go("lead-form")}><Plus size={16} /> {t("leads.new")}</button>
        </>} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<LeadTab> items={TABS.map((x) => ({ key: x.key, label: x.label, count: counts[x.key], tone: x.tone }))} value={term ? ("" as LeadTab) : tab} onChange={(k) => { setTab(k); setQ(""); setOpenId(undefined); setMode(null); }} />
        <label className="relative w-full sm:w-64">
          <span className="sr-only">{t("common.search")}</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input h-10 pl-9 pr-9 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx("Search name, phone, L-…")} />
          {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted" aria-label={tx("Clear search")}><X size={15} /></button>}
        </label>
      </div>
      {!term && <p className="-mt-2 text-[13px] text-muted">{tx(TABS.find((x) => x.key === tab)?.hint ?? "")}</p>}
      <p className="rounded-xl border border-sky-light bg-sky-light/60 px-4 py-2.5 text-[13px] text-body">
        <strong className="text-sky">{t("leads.plan")}:</strong> {cad.map((d, i) => i === 0 ? tx("Call 1 within 1 hour") : tx("Call {n} day {d}", { n: i + 1, d })).join(" · ")} {tx("→ no answer after {n} calls = closed. Send a message after each missed call.", { n: max })}
        {isPartner && <> <button className="font-semibold text-sky underline-offset-2 hover:underline" onClick={() => go("settings")}>{tx("Change")}</button></>}
      </p>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <section aria-label={tx("Lead list")} className="card min-w-0 flex-1 overflow-hidden">
          <div className="hidden gap-3 border-b border-line bg-canvas px-4 py-2.5 md:flex">
            <span className="eyebrow w-[70px]">{t("leads.logged")}</span><span className="eyebrow flex-1">{t("leads.family")}</span>
            <span className="eyebrow w-[92px]">{t("leads.calls")}</span><span className="eyebrow w-[180px] text-right">{tab === "all" || tab === "logged" ? tx("Status") : t("leads.next")}</span>
          </div>
          {term && <div className="border-b border-line px-4 py-2.5 text-sm text-muted">{txn(rows.length, "1 result for “{q}”", "{n} results for “{q}”", { q })}</div>}
          {rows.length === 0 && <Empty>{term ? tx("No matching enquiries.") : tab === "today" ? tx("No calls due today. 🎉") : tab === "logged" ? tx("No new enquiries today yet.") : t("common.nothing")}</Empty>}
          {rows.map((l) => {
            const on = l.id === sel?.id;
            return (
              <button key={l.id} onClick={() => { setOpenId(l.id); setMode(null); setNote(""); }}
                className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line-soft px-4 py-3.5 text-left last:border-0 md:flex-nowrap ${on ? "bg-sky-light/70 shadow-[inset_4px_0_0_#2f7fa6]" : "hover:bg-canvas"}`}>
                <span className="hidden w-[70px] flex-none text-[13px] text-body md:block">{fmtDate(dateInTZ(l.created_at))}</span>
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={l.parent_name} active={on} size={38} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-1.5"><strong className="text-[15px]">{l.parent_name}</strong>
                      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${SRC_TONE[l.source] ?? "bg-canvas text-body"}`}>{SOURCES[l.source] ?? l.source}</span></span>
                    <span className="truncate text-[13px] text-muted">{[l.child_name, l.child_age && tx("{n} yrs", { n: l.child_age }), interests(l) || l.concern].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                </span>
                <span className="flex w-[92px] flex-none flex-col gap-1">
                  <span className="flex gap-1" aria-label={tx("{n} of {max} calls", { n: l.call_attempts, max })}>
                    {Array.from({ length: max }, (_, i) => <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < l.call_attempts ? "bg-sky" : "border-[1.5px] border-[#9aacaf] bg-white"}`} />)}
                  </span>
                  <span className="text-xs text-muted">{tx("{n} of {max}", { n: l.call_attempts, max })}</span>
                </span>
                <span className="ml-auto flex flex-col items-end gap-1 text-right md:w-[180px]">
                  {(tab === "all" || tab === "logged" || term) && <span className={`pill ${STATUS_PILL[stateOf(l)][1]}`}>{tx(STATUS_PILL[stateOf(l)][0])}</span>}
                  <span className={`text-[13px] font-semibold ${nextColor(l)}`}>{l.status === "registered" ? "" : nextLabel(l)}</span>
                </span>
              </button>
            );
          })}
        </section>

        {sel && (
          <aside aria-label={tx("Lead details")} className="card order-first w-full flex-none overflow-hidden lg:sticky lg:top-6 lg:order-none lg:w-[390px]">
            <div className={`flex flex-col gap-2.5 p-5 text-white ${headTone}`}>
              <div className="flex justify-between text-xs text-white/80"><span>{sel.code}</span><span>{t("leads.logged")} {fmtDate(dateInTZ(sel.created_at))} · {SOURCES[sel.source] ?? sel.source}</span></div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">{sel.parent_name}{sel.relationship && <span className="text-sm font-normal text-white/80"> · {sel.relationship}</span>}</h2>
                  <p className="mt-1 text-sm text-white/85">{[sel.child_name, sel.child_age && tx("{n} yrs", { n: sel.child_age })].filter(Boolean).join(txLang() === "am" ? "፣ " : ", ") || tx("Child not named yet")}{interests(sel) && ` · ${interests(sel)}`}</p>
                  <p className="mt-0.5 text-sm text-white/85">{sel.phone}{sel.area && ` · ${sel.area}`}</p>
                </div>
                <button onClick={() => go("lead-form", { id: sel.id })} className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white/20 hover:bg-white/30" aria-label={tx("Edit enquiry")}><Pencil size={15} /></button>
              </div>
              <ContactButtons dark phone={sel.phone} telegram={sel.telegram} message={message("leadFollowUp", lang, { parent: sel.parent_name, branch: db.settings.branch_name })} />
            </div>
            <div className="flex flex-col gap-4 p-5">
              <div className="flex justify-between gap-3 rounded-xl bg-canvas px-3.5 py-3 text-sm"><span className="text-muted">{t("leads.next")}</span><strong className={nextColor(sel)}>{nextLabel(sel)}</strong></div>
              {(sel.concern || sel.notes) && (
                <div className="rounded-xl bg-gold-light/70 p-3 text-sm leading-relaxed">
                  {sel.concern && <p><span className="text-muted">{tx("Concern:")}</span> {sel.concern}</p>}
                  {sel.notes && <p className="mt-1 whitespace-pre-line">{sel.notes}</p>}
                </div>
              )}
              <div className="flex flex-col gap-1">
                <span className="eyebrow mb-1">{t("leads.callHistory")}</span>
                {calls.length === 0 && <span className="text-sm text-muted">{tx("No calls yet.")}</span>}
                {calls.map((c) => (
                  <div key={c.id} className="flex justify-between gap-2 border-b border-line-soft py-1.5 text-[13px] last:border-0">
                    <span>{tx("Call {n}", { n: c.attempt_no })} · {OUTCOMES[c.outcome] ?? c.outcome}{c.note && <span className="text-muted"> — {c.note}</span>}</span>
                    <span className="whitespace-nowrap text-muted">{fmtDateTime(c.called_at)}</span>
                  </div>
                ))}
              </div>
              {(sel.status === "open" || sel.status === "assessment_booked") && (
                <div className="flex flex-col gap-2.5">
                  <span className="eyebrow">{t("leads.logCall")}</span>
                  <input className="input h-10 text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder={tx("Short note (optional)")} aria-label={tx("Call note")} />
                  {mode === null && (
                    <div className="grid grid-cols-2 gap-2">
                      <button className="btn btn-secondary btn-sm h-10" onClick={() => log("no_answer")}>{t("leads.noAnswer")}</button>
                      <button className="btn btn-sm h-10 bg-sky-light font-semibold text-sky" onClick={() => setMode("answered")}>{t("leads.answered")}</button>
                      <button className="btn btn-soft-green btn-sm h-10" onClick={() => setMode("book")}>{t("leads.book")}</button>
                      <ConfirmButton label={t("leads.notInterested")} className="btn btn-secondary btn-sm h-10" confirmLabel={tx("Close lead")} onConfirm={() => log("not_interested")} />
                      <ConfirmButton label={t("leads.outOfArea")} className="btn btn-secondary btn-sm h-10" confirmLabel={tx("Close lead")} onConfirm={() => log("out_of_area")} />
                      <ConfirmButton label={t("leads.price")} className="btn btn-secondary btn-sm h-10" confirmLabel={tx("Close lead")} onConfirm={() => log("price")} />
                    </div>
                  )}
                  {mode === "answered" && (
                    <div className="flex flex-col gap-2 rounded-xl bg-sky-light/70 p-3">
                      <DateField small required label={tx("Call again on")} value={nextDate} min={today} onChange={(v) => setNextDate(v || nextDate)} />
                      <div className="flex gap-2"><button className="btn btn-secondary btn-sm flex-1" onClick={() => setMode(null)}>{tx("Back")}</button><button className="btn btn-primary btn-sm flex-1" onClick={() => log("answered")}>{tx("Save call")}</button></div>
                    </div>
                  )}
                  {mode === "book" && (
                    <div className="flex flex-col gap-2 rounded-xl bg-leaf-light/80 p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <DateField small required label={tx("Date")} value={aDate} min={today} onChange={(v) => setADate(v || aDate)} />
                        <label className="label text-xs">{tx("Time")}<input className="input h-10" type="time" value={aTime} onChange={(e) => setATime(e.target.value || aTime)} /></label>
                      </div>
                      <div className="flex gap-2"><button className="btn btn-secondary btn-sm flex-1" onClick={() => setMode(null)}>{tx("Back")}</button><button className="btn btn-green btn-sm flex-1" onClick={() => log("booked_assessment")}>{tx("Book")}</button></div>
                    </div>
                  )}
                </div>
              )}
              {sel.status === "registered" && sel.child_id && <button className="btn btn-soft-green" onClick={() => go("children", { open: sel.child_id! })}>{tx("Open child record")}</button>}
              {sel.status !== "registered" && <button className="btn btn-green" onClick={() => go("child-form", { lead: sel.id })}>{t("leads.register")} →</button>}
              {sel.status === "closed" && <button className="btn btn-secondary" onClick={() => { update((d) => { const l = d.leads.find((x) => x.id === sel.id)!; l.status = "open"; l.close_reason = null; l.next_call_at = new Date().toISOString(); }); setTab("today"); setOpenId(sel.id); toast(tx("Lead reopened")); }}>{t("leads.reopen")}</button>}
              {isPartner && <div className="text-right"><ConfirmButton label={tx("Delete enquiry")} confirmLabel={tx("Delete")} onConfirm={() => { update((d) => { d.leads = d.leads.filter((x) => x.id !== sel.id); d.leadCalls = d.leadCalls.filter((c) => c.lead_id !== sel.id); }, ["Deleted enquiry {code}", { code: sel.code }]); setOpenId(undefined); toast(tx("Enquiry deleted")); }} /></div>}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
