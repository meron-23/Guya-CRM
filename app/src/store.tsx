import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Balance, Child, Expense, Lead, LeadCall, Payment, Profile, ReminderLog, Service, Settings, Therapist } from "@/lib/types";
import { addDays, addMonths, addisToUTC, dayOfMonth, monthStart, todayISO } from "@/lib/format";
import { txd, txLang, txMap } from "@/lib/tr";
import { emptyDatabase, loadDatabase, persistChanges } from "@/lib/data";
import { getSupabase, isSupabaseConfigured, signIn as supabaseSignIn } from "@/lib/supabase";

/* ───────────────────────── Data model (mirrors the real database) ───────────────────────── */

export interface Activity { id: number; actor: string | null; summary: string; vars?: Record<string, string | number>; created_at: string }
export type Log = string | [string, Record<string, string | number>];
export interface DB {
  settings: Settings;
  services: Service[];
  therapists: Therapist[];
  profiles: Profile[];
  leads: Lead[];
  leadCalls: LeadCall[];
  children: Child[];
  payments: Payment[];
  expenses: Expense[];
  reminders: ReminderLog[];
  activity: Activity[];
  seq: { lead: number; child: number; payment: number; activity: number };
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const pad = (n: number, w: number) => String(n).padStart(w, "0");
const at = (date: string, time = "10:00") => addisToUTC(date, time);

/* ───────────────────────── Sample data, dated relative to today ───────────────────────── */

export const USERS = { amman: "u-amman", sara: "u-sara", mekdes: "u-mekdes" };

export function seed(): DB {
  const T = todayISO();
  const m0 = monthStart(T), m1 = addMonths(T, -1), m2 = addMonths(T, -2);
  const d = (n: number) => addDays(T, n);
  const day = (month: string, n: number) => addDays(month, n - 1);

  const services: Service[] = [
    { id: "s-aba", category: "therapy", name: "ABA therapy", description: "5 sessions a week", billing: "monthly", price: 9000, active: true, sort: 1 },
    { id: "s-speech", category: "therapy", name: "Speech therapy", description: "45-minute session", billing: "per_session", price: 500, active: true, sort: 2 },
    { id: "s-ot", category: "therapy", name: "Occupational therapy", description: "Charged by the hour", billing: "per_hour", price: 875, active: true, sort: 3 },
    { id: "s-day", category: "daycare", name: "Day care", description: "Monday – Friday", billing: "monthly", price: 5000, active: true, sort: 4 },
    { id: "s-assess", category: "assessment", name: "Initial assessment", description: "One-time", billing: "one_time", price: 1500, active: true, sort: 5 },
  ];
  const therapists: Therapist[] = [
    { id: "t-hana", name: "Hana", specialty: "ABA", phone: "0911000001", active: true },
    { id: "t-meklit", name: "Meklit", specialty: "Speech", phone: "0911000002", active: true },
    { id: "t-samuel", name: "Samuel", specialty: "Occupational therapy", phone: "0911000003", active: true },
  ];
  const profiles: Profile[] = [
    { id: USERS.amman, full_name: "Amman Esrael", email: null, username: "amman", role: "partner", active: true },
    { id: USERS.sara, full_name: "Sara Alemayehu", email: null, username: "sara", role: "partner", active: true },
    { id: USERS.mekdes, full_name: "Mekdes Tilahun", email: null, username: "mekdes", role: "staff", active: true },
  ];

  let L = 0;
  const lead = (p: Partial<Lead> & { parent_name: string; created: string; time?: string }): Lead => ({
    id: uid(), code: `L-${pad(++L, 3)}`, relationship: "", phone: "", has_whatsapp: false, telegram: "", preferred_channel: "call", child_name: "",
    child_age: "", service_id: null, concern: "", source: "other", area: "", notes: "", status: "open", close_reason: null, call_attempts: 0,
    next_call_at: null, assessment_at: null, child_id: null, created_at: at(p.created, p.time ?? "10:00"), service_ids: p.service_ids ?? (p.service_id ? [p.service_id] : []), ...p,
  });

  // Families who already registered
  const regLeads = [
    lead({ parent_name: "Liya Mekonnen", relationship: "Mother", phone: "0911234521", has_whatsapp: true, telegram: "liyamek", preferred_channel: "telegram", child_name: "Natan Mekonnen", child_age: "4", service_id: "s-speech", concern: "Not speaking yet", source: "tiktok", area: "Bethel", status: "registered", call_attempts: 2, created: day(m2, 1) }),
    lead({ parent_name: "Abel Girma", relationship: "Father", phone: "0912345648", child_name: "Ruth Abel", child_age: "6", service_id: "s-aba", concern: "Autism diagnosis", source: "referral", area: "Bethel", status: "registered", call_attempts: 1, created: day(m2, 2) }),
    lead({ parent_name: "Tigist Kebede", relationship: "Mother", phone: "0913456707", has_whatsapp: true, preferred_channel: "whatsapp", child_name: "Eyoel Kebede", child_age: "5", service_id: "s-ot", concern: "Fine motor skills", source: "facebook", area: "Ayat", status: "registered", call_attempts: 2, created: day(m1, 1) }),
    lead({ parent_name: "Saron Solomon", relationship: "Mother", phone: "0914567863", has_whatsapp: true, telegram: "saronsol", preferred_channel: "telegram", child_name: "Mahlet Solomon", child_age: "3", service_id: "s-day", concern: "Day care with support", source: "referral", area: "Bethel", status: "registered", call_attempts: 1, created: day(m1, 1) }),
    lead({ parent_name: "Mulu Tesfaye", relationship: "Mother", phone: "0915678990", has_whatsapp: true, preferred_channel: "whatsapp", child_name: "Kidus Tesfaye", child_age: "7", service_id: "s-aba", concern: "Behaviour support", source: "tiktok", area: "Kolfe", status: "registered", call_attempts: 3, created: day(m1, 2) }),
    lead({ parent_name: "Dawit Mengistu", relationship: "Father", phone: "0916789035", child_name: "Amen Dawit", child_age: "4", service_id: "s-assess", concern: "Speech and attention", source: "doctor", area: "Bethel", status: "registered", call_attempts: 2, created: d(-9) }),
  ];

  let C = 0;
  const child = (p: Partial<Child> & { name: string; parent_name: string; joined_on: string }, leadIdx: number): Child => {
    const c: Child = {
      id: uid(), code: `GU-${pad(++C, 3)}`, date_of_birth: null, gender: "", relationship: "", phone: "", has_whatsapp: false, telegram: "",
      preferred_channel: "call", second_contact_name: "", second_contact_phone: "", service_id: null, service_ids: [], service_qty: {}, first_month_fee: null, therapist_id: null, schedule: "", monthly_fee: 0,
      status: "active", left_on: null, lead_id: regLeads[leadIdx].id, notes: "", created_at: at(p.joined_on), ...p,
    };
    if (!c.service_ids.length && c.service_id) c.service_ids = [c.service_id];
    regLeads[leadIdx].child_id = c.id;
    return c;
  };
  const children: Child[] = [
    child({ name: "Natan Mekonnen", date_of_birth: "2022-06-14", gender: "male", parent_name: "Liya Mekonnen", relationship: "Mother", phone: "0911234521", has_whatsapp: true, telegram: "liyamek", preferred_channel: "telegram", service_id: "s-speech", service_qty: { "s-speech": 12 }, therapist_id: "t-meklit", schedule: "Mon, Wed, Fri 9:00", monthly_fee: 6000, joined_on: m2 }, 0),
    child({ name: "Ruth Abel", date_of_birth: "2020-03-02", gender: "female", parent_name: "Abel Girma", relationship: "Father", phone: "0912345648", service_id: "s-aba", therapist_id: "t-hana", schedule: "Mon – Fri 9:00", monthly_fee: 9000, joined_on: m2 }, 1),
    child({ name: "Eyoel Kebede", date_of_birth: "2021-01-20", gender: "male", parent_name: "Tigist Kebede", relationship: "Mother", phone: "0913456707", has_whatsapp: true, preferred_channel: "whatsapp", service_id: "s-ot", service_qty: { "s-ot": 8 }, therapist_id: "t-samuel", schedule: "Tue, Thu 14:00", monthly_fee: 7000, joined_on: m1 }, 2),
    child({ name: "Mahlet Solomon", date_of_birth: "2023-02-11", gender: "female", parent_name: "Saron Solomon", relationship: "Mother", phone: "0914567863", has_whatsapp: true, telegram: "saronsol", preferred_channel: "telegram", service_id: "s-day", service_ids: ["s-day", "s-speech"], service_qty: { "s-speech": 12 }, therapist_id: "t-meklit", schedule: "Day care Mon – Fri · speech Tue, Thu", monthly_fee: 11000, joined_on: m1 }, 3),
    child({ name: "Kidus Tesfaye", date_of_birth: "2019-09-30", gender: "male", parent_name: "Mulu Tesfaye", relationship: "Mother", phone: "0915678990", has_whatsapp: true, preferred_channel: "whatsapp", service_id: "s-aba", therapist_id: "t-hana", schedule: "Mon – Fri 10:00", monthly_fee: 9000, first_month_fee: 4800, joined_on: day(m1, 15) }, 4),
    child({ name: "Amen Dawit", date_of_birth: "2022-04-08", gender: "male", parent_name: "Dawit Mengistu", relationship: "Father", phone: "0916789035", service_id: "s-assess", therapist_id: "t-meklit", schedule: "Plan starts next month", monthly_fee: 0, status: "waiting", joined_on: d(-2) }, 5),
  ];
  const byName = (n: string) => children.find((c) => c.name === n)!;

  let P = 0;
  const pay = (name: string, amount: number, period: string | null, method: string, ref: string, paid: string): Payment => {
    const c = byName(name);
    return {
      id: uid(), code: `P-${pad(++P, 4)}`, child_id: c.id, service_id: period ? c.service_id : "s-assess", payer_name: c.parent_name, amount, period_month: period,
      method, reference: ref, screenshot: null, note: "", paid_on: paid, received_by: USERS.mekdes, voided: false, void_reason: null, created_at: at(paid, "11:20"),
    };
  };
  const payments: Payment[] = [
    pay("Natan Mekonnen", 1500, null, "cash", "R-012", addDays(m2, -3)),
    pay("Natan Mekonnen", 6000, m2, "telebirr", "TX7781203", day(m2, 5)),
    pay("Ruth Abel", 9000, m2, "telebirr", "TX7790551", day(m2, 8)),
    pay("Natan Mekonnen", 6000, m1, "cbe", "FT2510034", day(m1, 3)),
    pay("Ruth Abel", 9000, m1, "cbe", "FT2510872", day(m1, 6)),
    pay("Eyoel Kebede", 7000, m1, "cash", "R-031", day(m1, 6)),
    pay("Mahlet Solomon", 11000, m1, "cbe", "FT2510215", day(m1, 2)),
    pay("Kidus Tesfaye", 4800, m1, "telebirr", "TX8102233", day(m1, 15)),
  ];
  // This month — only if the date has passed
  const thisMonth: [string, number, string, string, number][] = [
    ["Mahlet Solomon", 11000, "cbe", "FT2511094", 3], ["Natan Mekonnen", 6000, "telebirr", "TX8820145", 4],
    ["Kidus Tesfaye", 9000, "telebirr", "TX8840921", 5], ["Eyoel Kebede", 4000, "telebirr", "TX8831772", 7],
  ];
  for (const [n, a, m, r, dd] of thisMonth) {
    const paidOn = day(m0, dd) <= T ? day(m0, dd) : T;
    payments.push(pay(n, a, m0, m, r, paidOn));
  }
  payments.push(pay("Amen Dawit", 1500, null, "cash", "R-044", d(-2)));

  const openLeads = [
    lead({ parent_name: "Selam Tadesse", relationship: "Mother", phone: "0921112233", has_whatsapp: true, preferred_channel: "whatsapp", child_name: "Bereket", child_age: "4", service_id: "s-speech", concern: "Not speaking yet", source: "tiktok", area: "Bole", notes: "Saw our TikTok video. Asked about fees and Saturday assessments.", created: T, time: "09:40", next_call_at: at(T, "09:40") }),
    lead({ parent_name: "Dawit Asfaw", relationship: "Father", phone: "0922334455", telegram: "dawitasfaw", preferred_channel: "telegram", child_name: "Hanna", child_age: "6", service_id: "s-aba", concern: "Autism diagnosis", source: "referral", area: "Bethel", notes: "Referred by Liya (Natan's mother). Has a hospital diagnosis letter.", call_attempts: 1, created: d(-1), time: "15:10", next_call_at: at(T, "09:00") }),
    lead({ parent_name: "Meseret Kassa", relationship: "Mother", phone: "0923445566", has_whatsapp: true, preferred_channel: "whatsapp", child_name: "Abel", child_age: "3", service_id: "s-day", concern: "Needs day care", source: "facebook", area: "Ayat", notes: "Wants to discuss with her husband first.", call_attempts: 2, created: d(-3), time: "11:00", next_call_at: at(T, "09:00") }),
    lead({ parent_name: "Biruk Haile", relationship: "Father", phone: "0924556677", child_name: "Lidya", child_age: "5", service_id: "s-assess", concern: "Asked how long an assessment takes", source: "tiktok", area: "Bethel", call_attempts: 1, created: d(-4), time: "16:30", next_call_at: at(d(-3), "09:00") }),
    lead({ parent_name: "Rahel Worku", relationship: "Mother", phone: "0925667788", has_whatsapp: true, telegram: "rahelw", preferred_channel: "telegram", child_name: "Sofia", child_age: "4", service_id: "s-speech", concern: "Speech delay", source: "facebook", area: "Kolfe", notes: "Interested, checking her schedule.", call_attempts: 2, created: d(-2), time: "10:15", next_call_at: at(d(1), "09:00") }),
    lead({ parent_name: "Tsion Fikru", relationship: "Mother", phone: "0926778899", child_name: "Nahom", child_age: "7", service_id: "s-aba", concern: "Behaviour support", source: "doctor", area: "Bethel", notes: "Not answering. Last attempt next week.", call_attempts: 4, created: d(-10), time: "12:00", next_call_at: at(d(4), "09:00") }),
    lead({ parent_name: "Yonas Gebre", relationship: "Father", phone: "0927889900", has_whatsapp: true, preferred_channel: "whatsapp", child_name: "Mikias", child_age: "5", service_id: "s-aba", concern: "Autism diagnosis", source: "doctor", area: "Bethel", notes: "Bring previous medical reports.", status: "assessment_booked", call_attempts: 2, created: d(-6), time: "14:00", assessment_at: at(d(1), "10:00") }),
    lead({ parent_name: "Hiwot Bekele", relationship: "Mother", phone: "0928990011", child_name: "Eden", child_age: "7", service_id: "s-speech", concern: "Speech delay", source: "walk_in", area: "Adama", notes: "Lives in Adama — keep for a future branch.", status: "closed", close_reason: "out_of_area", call_attempts: 1, created: d(-11) }),
    lead({ parent_name: "Samuel Negash", relationship: "Father", phone: "0929001122", child_name: "Yared", child_age: "6", service_id: "s-aba", source: "facebook", notes: "Closed automatically after 5 calls.", status: "closed", close_reason: "no_response", call_attempts: 5, created: d(-25) }),
    lead({ parent_name: "Feven Tesfaye", relationship: "Mother", phone: "0930112233", has_whatsapp: true, preferred_channel: "whatsapp", child_name: "Lulit", child_age: "3", service_id: "s-day", source: "instagram", area: "CMC", notes: "Found the price too high for now.", status: "closed", close_reason: "price", call_attempts: 2, created: d(-8) }),
  ];
  const leads = [...regLeads, ...openLeads];
  const findLead = (n: string) => leads.find((l) => l.parent_name === n)!;
  const call = (n: string, no: number, outcome: string, note: string, date: string, time: string): LeadCall => ({ id: uid(), lead_id: findLead(n).id, attempt_no: no, outcome, note, called_at: at(date, time), called_by: USERS.mekdes });
  const leadCalls: LeadCall[] = [
    call("Dawit Asfaw", 1, "no_answer", "Sent a Telegram message", d(-1), "15:30"),
    call("Meseret Kassa", 1, "answered", "Will discuss at home", d(-3), "11:20"),
    call("Meseret Kassa", 2, "no_answer", "WhatsApp sent", d(-2), "09:30"),
    call("Biruk Haile", 1, "no_answer", "Telegram sent", d(-4), "16:45"),
    call("Rahel Worku", 1, "answered", "Interested", d(-2), "10:30"),
    call("Rahel Worku", 2, "no_answer", "", d(-1), "09:15"),
    ...[1, 2, 3, 4].map((n) => call("Tsion Fikru", n, "no_answer", "", d(-10 + [0, 1, 3, 7][n - 1]), "09:10")),
    call("Yonas Gebre", 1, "no_answer", "", d(-6), "14:20"),
    call("Yonas Gebre", 2, "booked_assessment", "Assessment tomorrow 10:00 with Hana", d(-5), "10:00"),
    call("Hiwot Bekele", 1, "out_of_area", "Lives in Adama", d(-11), "10:20"),
    call("Feven Tesfaye", 1, "no_answer", "", d(-8), "10:15"),
    call("Feven Tesfaye", 2, "price", "Will come back later", d(-7), "09:30"),
    call("Samuel Negash", 5, "no_answer", "Closed — no response", d(-11), "09:00"),
  ];

  const E: [Expense["category"], string, number, string, string][] = [];
  for (const [mm, extra] of [[m1, 0], [m0, 1]] as const) {
    E.push(["rent", "Building rent", 6000, day(mm, 1), "bank"]);
    E.push(["salaries", "Hana — ABA therapist", 3000, day(mm, 5), "cbe"], ["salaries", "Meklit — speech therapist", 2500, day(mm, 5), "cbe"]);
    E.push(["salaries", "Samuel — occupational therapist", 2500, day(mm, 5), "cbe"], ["salaries", "Mekdes — reception", 1500, day(mm, 5), "telebirr"]);
    E.push(["utilities", "Electricity", extra ? 600 : 450, day(mm, 11), "telebirr"], ["utilities", "Water", extra ? 200 : 150, day(mm, 11), "telebirr"], ["utilities", "Internet", 1400, day(mm, 10), "telebirr"]);
    E.push(["misc", "Cleaning supplies", extra ? 450 : 400, day(mm, 3), "cash"]);
    if (extra) E.push(["misc", "Sensory toys", 550, day(mm, 12), "cash"]);
  }
  const expenses: Expense[] = E.filter((e) => e[3] <= T).map(([category, description, amount, spent_on, method]) => ({ id: uid(), category, description, amount, spent_on, method, note: "", created_at: at(spent_on) }));

  const reminders: ReminderLog[] = [
    { id: uid(), kind: "payment", child_id: byName("Eyoel Kebede").id, lead_id: null, channel: "whatsapp", message: "", result: "Read — will pay Monday", sent_by: USERS.mekdes, sent_at: at(d(-1), "09:12") },
    { id: uid(), kind: "call", child_id: null, lead_id: findLead("Dawit Asfaw").id, channel: "telegram", message: "", result: "No answer, message sent", sent_by: USERS.mekdes, sent_at: at(d(-1), "15:32") },
  ];
  const activity: Activity[] = [
    { id: 1, actor: USERS.mekdes, summary: "New enquiry · {name}", vars: { name: "Selam Tadesse" }, created_at: at(T, "09:40") },
    { id: 2, actor: USERS.amman, summary: "Added expense · {what} · {amount}", vars: { what: "Sensory toys", amount: 550 }, created_at: at(d(-1), "18:05") },
    { id: 3, actor: USERS.mekdes, summary: "Registered {name}", vars: { name: "Amen Dawit" }, created_at: at(d(-2), "11:30") },
    { id: 4, actor: USERS.mekdes, summary: "Payment · {name} · {amount}", vars: { name: "Amen Dawit", amount: 1500 }, created_at: at(d(-2), "11:20") },
  ];

  return {
    settings: { id: 1, branch_name: "Bethel Branch", centre_phone: "0911 000 000", fee_due_day: 5, reminder_days_before: 2, call_cadence: [0, 1, 3, 7, 14], default_language: "en", auto_weekly_report: true, auto_monthly_report: true, upfront: [{ months: 3, pct: 5 }, { months: 6, pct: 10 }] },
    services, therapists, profiles, leads, leadCalls, children, payments, expenses, reminders, activity,
    seq: { lead: L, child: C, payment: P, activity: 5 },
  };
}

/* ───────────────────────── Balances (same maths as the database view) ───────────────────────── */

/** What a payment covers towards the fee: money received plus any upfront discount. */
export const covered = (p: Payment) => Number(p.amount) + Number(p.discount ?? 0);
export const DEFAULT_UPFRONT = [{ months: 3, pct: 5 }, { months: 6, pct: 10 }];
export const upfrontOf = (db: DB) => db.settings.upfront ?? DEFAULT_UPFRONT;
export const isRecurring = (s?: Service | null) => !!s && s.billing !== "one_time";
export const isMonthly = (db: DB, c: Child) => c.service_ids.some((id) => isRecurring(db.services.find((s) => s.id === id)));
export const UNIT: Record<Service["billing"], string> = txMap({ monthly: "per month", per_session: "per session", per_hour: "per hour", one_time: "one time" });
export const QTY_LABEL: Record<string, string> = txMap({ per_session: "sessions a month", per_hour: "hours a month" });
export const DEFAULT_QTY = 8;
/** What one service costs a month for a child: monthly price, or price × sessions/hours. */
export function serviceMonthly(s: Service, qty?: Record<string, number>) {
  if (s.billing === "monthly") return Number(s.price);
  if (s.billing === "per_session" || s.billing === "per_hour") return Number(s.price) * (qty?.[s.id] ?? DEFAULT_QTY);
  return 0;
}
export const planTotal = (db: DB, ids: string[], qty?: Record<string, number>) => db.services.filter((s) => ids.includes(s.id)).reduce((a, s) => a + serviceMonthly(s, qty), 0);

/** What is expected for a given month: the first month can be pro-rated or set by hand. */
export function expectedFor(c: Child, month: string): number {
  const first = monthStart(c.joined_on);
  if (month < first) return 0;
  if (month === first && c.first_month_fee != null) return Number(c.first_month_fee);
  return Number(c.monthly_fee);
}

export function balances(db: DB, today = todayISO()): Map<string, Balance> {
  const out = new Map<string, Balance>();
  const thisMonth = monthStart(today);
  for (const c of db.children) {
    if (!isMonthly(db, c) || !(c.status === "active" || c.status === "left") || Number(c.monthly_fee) <= 0) continue;
    const first = monthStart(c.joined_on);
    const lastBase = c.status === "left" && c.left_on ? (c.left_on < today ? c.left_on : today) : today;
    const last = monthStart(lastBase);
    let expectedPast = 0, months = 0;
    for (let m = first; m <= last; m = addMonths(m, 1)) { months++; if (m < thisMonth) expectedPast += expectedFor(c, m); }
    const billedThis = last === thisMonth && first <= thisMonth;
    const live = db.payments.filter((p) => p.child_id === c.id && !p.voided);
    const paidPast = live.filter((p) => p.period_month && p.period_month < thisMonth).reduce((a, p) => a + covered(p), 0);
    const paidThis = live.filter((p) => p.period_month === thisMonth).reduce((a, p) => a + covered(p), 0);
    const feeThis = billedThis ? expectedFor(c, thisMonth) : Number(c.monthly_fee);
    const arrears = Math.max(expectedPast - paidPast, 0);
    const due = billedThis ? Math.max(feeThis - paidThis, 0) : 0;
    out.set(c.id, { child_id: c.id, monthly_fee: feeThis, months_billed: months, billed_this_month: billedThis, paid_this_month: paidThis, arrears, due_this_month: due, owes: arrears + due });
  }
  return out;
}

/** Pro-rated first-month fee for a start date in the middle of a month, rounded to the nearest 50. */
export function proRate(fee: number, startISO: string): number {
  const { day, days: dim } = dayOfMonth(startISO);
  if (day <= 1) return fee;
  return Math.round((fee * (dim - day + 1)) / dim / 50) * 50;
}

/** Easy-to-read password: a word, a dash and four digits (no look-alike letters). */
export function makePassword() {
  const words = ["Bethel", "Guya", "Addis", "Sunrise", "Garden", "River", "Coffee", "Meskel", "Entoto", "Habesha"];
  const r = (n: number) => Math.floor(Math.random() * n);
  return `${words[r(words.length)]}-${String(1000 + r(9000))}`;
}

/* ───────────────────────── Store ───────────────────────── */

type Ctx = {
  db: DB;
  update: (fn: (db: DB) => void, log?: Log) => void;
  refresh: () => Promise<void>;
  loading: boolean;
  error: string;
  userId: string;
  setUserId: (id: string) => void;
  me: Profile;
  signIn: (username: string, password: string) => Promise<"ok" | "wrong" | "off" | "error">;
  isPartner: boolean;
  newId: () => string;
};
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(emptyDatabase);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const dbRef = useRef(db);
  const userIdRef = useRef("");
  const partnerRef = useRef(false);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const setDatabase = useCallback((next: DB) => {
    dbRef.current = next;
    setDb(next);
  }, []);
  const setAuthenticatedUser = useCallback((id: string) => {
    userIdRef.current = id;
    setUserId(id);
  }, []);
  const refresh = useCallback(async () => {
    if (!userIdRef.current) return;
    const current = await loadDatabase(partnerRef.current);
    setDatabase(current);
    setError("");
  }, [setDatabase]);
  const establishSession = useCallback(async (id: string | null) => {
    if (!id) {
      partnerRef.current = false;
      setAuthenticatedUser("");
      setDatabase(emptyDatabase());
      setLoading(false);
      return;
    }
    setLoading(true);
    const client = getSupabase();
    const { data, error: profileError } = await client.from("profiles").select("*").eq("id", id).maybeSingle();
    if (profileError) throw profileError;
    if (!data || !data.active) {
      await client.auth.signOut();
      partnerRef.current = false;
      setAuthenticatedUser("");
      setDatabase(emptyDatabase());
      setLoading(false);
      if (data && !data.active) setError("This login has been turned off. Ask a partner.");
      return;
    }
    partnerRef.current = data.role === "partner";
    setAuthenticatedUser(id);
    const loaded = await loadDatabase(partnerRef.current);
    setDatabase(loaded);
    setError("");
    setLoading(false);
  }, [setAuthenticatedUser, setDatabase]);
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in app/.env.local.");
      setLoading(false);
      return;
    }
    let active = true;
    const client = getSupabase();
    const initialize = async () => {
      try {
        const { data, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        if (active) await establishSession(data.session?.user.id ?? null);
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : String(reason));
          setLoading(false);
        }
      }
    };
    void initialize();
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      void establishSession(session?.user.id ?? null).catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : String(reason));
          setLoading(false);
        }
      });
    });
    const onFocus = () => { if (document.visibilityState === "visible" && userIdRef.current) void refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))); };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [establishSession, refresh]);
  const update = useCallback((fn: (db: DB) => void, log?: Log) => {
    const before = dbRef.current;
    const next: DB = structuredClone(before);
    fn(next);
    if (log) next.activity.unshift({ id: Date.now(), actor: userId || null, summary: typeof log === "string" ? log : log[0], vars: typeof log === "string" ? undefined : log[1], created_at: new Date().toISOString() });
    setDatabase(next);
    writeQueue.current = writeQueue.current.then(async () => {
      await persistChanges(before, next);
      const current = await loadDatabase(partnerRef.current);
      setDatabase(current);
      setError("");
    }).catch(async (reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(`Could not save your changes: ${message}`);
      try {
        const current = await loadDatabase(partnerRef.current);
        setDatabase(current);
      } catch (reloadReason) {
        setError(`Could not save or reload your changes: ${message}; ${reloadReason instanceof Error ? reloadReason.message : String(reloadReason)}`);
      }
    });
  }, [setDatabase, userId]);
  const signIn = useCallback(async (username: string, password: string) => {
    try {
      const { data, error: authError } = await supabaseSignIn(username, password);
      if (authError || !data.user) return "wrong";
      const { data: profile, error: profileError } = await getSupabase().from("profiles").select("active").eq("id", data.user.id).maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.active) {
        await getSupabase().auth.signOut();
        return "off";
      }
      await establishSession(data.user.id);
      return "ok";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return "error";
    }
  }, [establishSession]);
  const logOut = useCallback((id: string) => {
    if (id) return;
    void getSupabase().auth.signOut().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
    setAuthenticatedUser("");
    setDatabase(emptyDatabase());
  }, [setAuthenticatedUser, setDatabase]);
  const me = db.profiles.find((p) => p.id === userId) ?? { id: "", full_name: "", email: null, username: "", role: "staff" as const, active: false };
  const value = useMemo<Ctx>(() => ({
    db, update, refresh, loading, error, userId, setUserId: logOut, me, isPartner: me.role === "partner", signIn, newId: uid,
  }), [db, update, refresh, loading, error, userId, logOut, me, signIn]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

/** In Amharic, the built-in defaults (service names, branch name…) show translated. Typed data stays as typed. */
function localize(db: DB): DB {
  return {
    ...db,
    settings: { ...db.settings, branch_name: txd(db.settings.branch_name) },
    services: db.services.map((s) => ({ ...s, name: txd(s.name), description: txd(s.description) })),
    therapists: db.therapists.map((t) => ({ ...t, specialty: txd(t.specialty) })),
  };
}
export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("StoreProvider missing");
  const lang = txLang();
  const db = useMemo(() => (lang === "am" ? localize(c.db) : c.db), [c.db, lang]);
  return { ...c, db, rawDb: c.db };
}

/* ───────────────────────── Business rules (same as the real app) ───────────────────────── */

export function logLeadCall(db: DB, leadId: string, outcome: string, note: string, by: string, nextAt?: string, assessmentAt?: string) {
  const l = db.leads.find((x) => x.id === leadId);
  if (!l) return;
  const cad = db.settings.call_cadence;
  const n = l.call_attempts + 1;
  db.leadCalls.push({ id: uid(), lead_id: leadId, attempt_no: n, outcome, note, called_at: new Date().toISOString(), called_by: by });
  l.call_attempts = n;
  if (outcome === "no_answer") {
    if (n >= cad.length) { l.status = "closed"; l.close_reason = "no_response"; l.next_call_at = null; }
    else {
      const created = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa" }).format(new Date(l.created_at));
      let due = addisToUTC(addDays(created, cad[n]), "09:00");
      if (due < new Date().toISOString()) due = addisToUTC(addDays(todayISO(), 1), "09:00");
      l.next_call_at = due;
    }
  } else if (outcome === "answered") {
    l.status = "open"; l.next_call_at = nextAt ?? addisToUTC(addDays(todayISO(), 2), "09:00");
  } else if (outcome === "booked_assessment") {
    l.status = "assessment_booked"; l.assessment_at = assessmentAt ?? null; l.next_call_at = null;
  } else {
    l.status = "closed"; l.next_call_at = null;
    l.close_reason = ["not_interested", "out_of_area", "price"].includes(outcome) ? outcome : "other";
  }
}
