import type { DB } from "./store";
import { addMonths, dateInTZ, fmtDate, fmtDateTime, fmtMonth, money, monthEnd, monthStart, todayISO } from "@/lib/format";
import { CHANNELS, CLOSE_REASONS, EXPENSE_LABEL, METHODS, OUTCOMES, SOURCES } from "@/lib/labels";
import { tx, txMap, txn } from "@/lib/tr";

export const DATASETS = ["leads", "calls", "registrations", "payments", "expenses", "reminders"] as const;
/** Staff never get expenses. */
export const datasetsFor = (partner: boolean) => DATASETS.filter((k) => partner || k !== "expenses");
export type Dataset = (typeof DATASETS)[number];
export const DATASET_LABEL: Record<Dataset, string> = txMap({ leads: "Leads", calls: "Calls made", registrations: "Registrations", payments: "Payments", expenses: "Expenses", reminders: "Reminders sent" });
export type Table = { key: Dataset; name: string; columns: string[]; rows: (string | number)[][]; voided?: boolean[] };
const cols = (c: string[]) => c.map((x) => tx(x));
const CHILD_STATUS = txMap({ active: "Active", waiting: "Waiting list", left: "Left the centre" });
const KIND = txMap({ payment: "Payment", call: "Call", assessment: "Assessment" });
const STATUS: Record<string, string> = txMap({ open: "Open", assessment_booked: "Assessment booked", registered: "Registered", closed: "Closed" });

export function buildReport(db: DB, from: string, to: string, include: Dataset[]) {
  const within = (d: string) => d >= from && d <= to;
  const svc = new Map(db.services.map((s) => [s.id, s.name]));
  const ther = new Map(db.therapists.map((s) => [s.id, s.name]));
  const ppl = new Map(db.profiles.map((s) => [s.id, s.full_name]));
  const kid = new Map(db.children.map((k) => [k.id, k]));
  const leads = db.leads.filter((l) => within(dateInTZ(l.created_at))).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const kids = db.children.filter((c) => within(c.joined_on));
  const pays = db.payments.filter((p) => within(p.paid_on)).sort((a, b) => a.paid_on.localeCompare(b.paid_on));
  const exps = db.expenses.filter((e) => within(e.spent_on)).sort((a, b) => a.spent_on.localeCompare(b.spent_on));
  const rem = db.reminders.filter((r) => within(dateInTZ(r.sent_at)));
  const calls = db.leadCalls.filter((c) => within(dateInTZ(c.called_at))).sort((a, b) => a.called_at.localeCompare(b.called_at));
  const leadById = new Map(db.leads.map((l) => [l.id, l]));
  const tables: Table[] = [];
  if (include.includes("leads")) tables.push({ key: "leads", name: DATASET_LABEL.leads, columns: cols(["Code", "Logged", "Parent", "Phone", "Child", "Interested in", "Source", "Area", "Status", "Closed because", "Calls"]),
    rows: leads.map((l) => [l.code, dateInTZ(l.created_at), l.parent_name, l.phone, l.child_name, (l.service_ids?.length ? l.service_ids : l.service_id ? [l.service_id] : []).map((id) => svc.get(id)).filter(Boolean).join(" + "), SOURCES[l.source] ?? l.source, l.area, STATUS[l.status], l.close_reason ? CLOSE_REASONS[l.close_reason] : "", l.call_attempts]) });
  if (include.includes("calls")) tables.push({ key: "calls", name: DATASET_LABEL.calls, columns: cols(["When", "Lead", "Parent", "Phone", "Call no.", "Outcome", "Note", "By"]),
    rows: calls.map((c) => { const l = leadById.get(c.lead_id); return [fmtDateTime(c.called_at), l?.code ?? "", l?.parent_name ?? "", l?.phone ?? "", c.attempt_no, OUTCOMES[c.outcome] ?? c.outcome, c.note, ppl.get(c.called_by ?? "") ?? ""]; }) });
  if (include.includes("registrations")) tables.push({ key: "registrations", name: DATASET_LABEL.registrations, columns: cols(["Code", "Child", "Parent", "Phone", "Service", "Therapist", "Monthly fee (ETB)", "Status", "Start date"]),
    rows: kids.map((c) => [c.code, c.name, c.parent_name, c.phone, c.service_ids.map((id) => svc.get(id)).filter(Boolean).join(" + "), ther.get(c.therapist_id ?? "") ?? "", Number(c.monthly_fee), CHILD_STATUS[c.status] ?? c.status, c.joined_on]) });
  if (include.includes("payments")) tables.push({ key: "payments", name: DATASET_LABEL.payments, voided: pays.map((p) => p.voided), columns: cols(["Receipt", "Date paid", "Child", "Paid by", "Service", "For month", "Amount (ETB)", "Discount (ETB)", "Method", "Reference", "Received by", "Voided"]),
    rows: pays.map((p) => [p.code, p.paid_on, kid.get(p.child_id)?.name ?? "", p.payer_name, svc.get(p.service_id ?? "") ?? tx("Monthly fee"), p.period_month ? fmtMonth(p.period_month) : tx("One-time"), Number(p.amount), Number(p.discount ?? 0), METHODS[p.method] ?? p.method, p.reference, ppl.get(p.received_by ?? "") ?? "", p.voided ? tx("Yes — {reason}", { reason: p.void_reason ?? "" }) : ""]) });
  if (include.includes("expenses")) tables.push({ key: "expenses", name: DATASET_LABEL.expenses, columns: cols(["Date", "Category", "Description", "Amount (ETB)", "Paid with"]),
    rows: exps.map((e) => [e.spent_on, EXPENSE_LABEL[e.category], e.description, Number(e.amount), METHODS[e.method] ?? e.method]) });
  if (include.includes("reminders")) tables.push({ key: "reminders", name: DATASET_LABEL.reminders, columns: cols(["Sent", "Type", "To", "Channel", "Note", "By"]),
    rows: rem.map((r) => [fmtDateTime(r.sent_at), KIND[r.kind] ?? r.kind, r.child_id ? kid.get(r.child_id)?.parent_name ?? "" : db.leads.find((l) => l.id === r.lead_id)?.parent_name ?? "", CHANNELS[r.channel] ?? r.channel, r.result, ppl.get(r.sent_by ?? "") ?? ""]) });
  const live = pays.filter((p) => !p.voided);
  const collected = live.reduce((a, p) => a + Number(p.amount), 0), spent = exps.reduce((a, e) => a + Number(e.amount), 0);
  const tally = <T,>(xs: T[], key: (x: T) => string, val: (x: T) => number) => { const m = new Map<string, number>(); xs.forEach((x) => m.set(key(x), (m.get(key(x)) ?? 0) + val(x))); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  return { tables, summary: { leads: leads.length, registrations: kids.length, payments: live.length, collected, expenses: spent, profit: collected - spent,
    calls: calls.length, assessments: calls.filter((c) => c.outcome === "booked_assessment").length, reminders: rem.length, discounts: live.reduce((a, p) => a + Number(p.discount ?? 0), 0),
    closed: leads.filter((l) => l.status === "closed").length,
    bySource: tally(leads, (l) => SOURCES[l.source] ?? l.source, () => 1), byExpense: tally(exps, (e) => EXPENSE_LABEL[e.category], (e) => Number(e.amount)) } };
}
/** Dates show in the chosen calendar everywhere a report is read by people. */
export const showCell = (v: string | number) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDate(v, { year: true }) : String(v ?? ""));
export function toCSV(tables: Table[]) {
  const cell = (v: string | number) => { const s = showCell(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return tables.map((t) => [t.name, t.columns.map(cell).join(","), ...t.rows.map((r) => r.map(cell).join(","))].join("\n")).join("\n\n");
}

export function monthlyMoney(db: DB, months: number, end = monthStart(todayISO())) {
  const out: { m: string; rev: number; exp: number; profit: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonths(end, -i), e = monthEnd(m);
    const rev = db.payments.filter((p) => !p.voided && p.paid_on >= m && p.paid_on <= e).reduce((a, p) => a + Number(p.amount), 0);
    const exp = db.expenses.filter((x) => x.spent_on >= m && x.spent_on <= e).reduce((a, x) => a + Number(x.amount), 0);
    out.push({ m, rev, exp, profit: rev - exp });
  }
  return out;
}


/** Ready-to-send weekly report text (Telegram / WhatsApp). Staff version has no money totals. */
export function reportMessage(db: DB, from: string, to: string, label: string, by: string, partner: boolean, overdueCalls: number, owing: number, title = tx("report")) {
  const { summary: s } = buildReport(db, from, to, []);
  const kids = db.children.filter((c) => c.joined_on >= from && c.joined_on <= to).map((c) => c.name);
  const pays = db.payments.filter((p) => !p.voided && p.paid_on >= from && p.paid_on <= to);
  const bundles = new Set(pays.map((p) => p.bundle ?? p.id)).size;
  const src = s.bySource.map(([k, v]) => `${k} ${v}`).join(", ");
  const lines = [
    `📋 ${tx("Guya {branch} — {title}", { branch: db.settings.branch_name, title })}`,
    `🗓 ${label}`,
    `✍️ ${tx("Prepared by {name}", { name: by })}`,
    "",
    `📞 ${tx("New enquiries: {n}", { n: s.leads })}${src ? ` (${src})` : ""}`,
    `☎️ ${tx("Calls made: {n} · Assessments booked: {a}", { n: s.calls, a: s.assessments })}`,
    `✅ ${tx("Registered: {n}", { n: s.registrations })}${kids.length ? ` — ${kids.join(", ")}` : ""}`,
    `💳 ${tx("Payments recorded: {n}", { n: bundles })}${partner ? ` — ${tx("collected {amount}", { amount: money(s.collected) })}` : ""}`,
    `🔔 ${tx("Reminders sent: {n}", { n: s.reminders })}`,
    `❌ ${tx("Leads closed: {n}", { n: s.closed })}`,
    "",
    `⚠️ ${tx("Right now:")} ${txn(overdueCalls, "1 call overdue", "{n} calls overdue")} · ${txn(owing, "1 family still owes", "{n} families still owe")}`,
  ];
  if (partner) lines.splice(9, 0, `🧾 ${tx("Expenses: {amount} · Profit: {profit}", { amount: money(s.expenses), profit: money(s.profit) })}`);
  return lines.join("\n");
}
