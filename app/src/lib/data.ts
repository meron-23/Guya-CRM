import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase, screenshotUrl, setLoginActive } from "./supabase";
import type { Child, Expense, Lead, LeadCall, Payment, Profile, ReminderLog, Service, Settings, Therapist } from "./types";
import type { Activity, DB } from "../store";

const EMPTY_SETTINGS: Settings = {
  id: 1, branch_name: "Bethel Branch", centre_phone: "", fee_due_day: 5, reminder_days_before: 2,
  call_cadence: [0, 1, 3, 7, 14], default_language: "en", auto_weekly_report: true, auto_monthly_report: true,
  upfront: [{ months: 3, pct: 5 }, { months: 6, pct: 10 }], calendar: "eth",
};

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function rows<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const result = await query;
  fail(result.error);
  return result.data ?? [];
}

export async function loadDatabase(isPartner: boolean): Promise<DB> {
  const client = getSupabase();
  const [profiles, settingsRows, services, therapists, leads, leadCalls, children, payments, reminders, activity, expenses] = await Promise.all([
    rows<Profile>(client.from("profiles").select("*").order("full_name")),
    rows<Settings>(client.from("settings").select("*").eq("id", 1)),
    rows<Service>(client.from("services").select("*").order("sort").order("name")),
    rows<Therapist>(client.from("therapists").select("*").order("name")),
    rows<Lead>(client.from("leads").select("*").order("created_at", { ascending: false })),
    rows<LeadCall>(client.from("lead_calls").select("*").order("called_at")),
    rows<Child>(client.from("children").select("*").order("name")),
    rows<(Payment & { screenshot_path?: string | null; bundle_id?: string | null })>(client.from("payments").select("*").order("created_at", { ascending: false })),
    rows<ReminderLog>(client.from("reminder_log").select("*").order("sent_at", { ascending: false })),
    isPartner ? rows<Activity>(client.from("activity_log").select("*").order("created_at", { ascending: false }).limit(200)) : Promise.resolve([]),
    isPartner ? rows<Expense>(client.from("expenses").select("*").order("spent_on", { ascending: false })) : Promise.resolve([]),
  ]);
  const paymentRows = await Promise.all(payments.map(async (payment) => {
    const screenshotPath = payment.screenshot_path ?? null;
    return {
      ...payment,
      bundle: payment.bundle_id ?? null,
      screenshot_path: screenshotPath,
      screenshot: screenshotPath ? await screenshotUrl(screenshotPath) : null,
    } as Payment;
  }));
  return {
    settings: settingsRows[0] ?? EMPTY_SETTINGS,
    services,
    therapists,
    profiles,
    leads: leads.map((lead) => ({ ...lead, service_ids: lead.service_ids ?? [] })),
    leadCalls,
    children: children.map((child) => ({ ...child, service_ids: child.service_ids ?? [], service_qty: child.service_qty ?? {} })),
    payments: paymentRows,
    expenses,
    reminders,
    activity,
    seq: { lead: 0, child: 0, payment: 0, activity: 0 },
  };
}

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function toRow<T extends object>(table: string, value: T): Record<string, unknown> & { id: string } {
  const row = { ...value } as Record<string, unknown> & { id: string };
  if (table === "leads" || table === "children") Reflect.deleteProperty(row, "code");
  if (table === "payments") {
    Reflect.deleteProperty(row, "code");
    row.bundle_id = row.bundle ?? null;
    row.screenshot_path = row.screenshot_path ?? row.screenshot ?? null;
    Reflect.deleteProperty(row, "bundle");
    Reflect.deleteProperty(row, "screenshot");
    Reflect.deleteProperty(row, "received_by");
  }
  if (table === "expenses") Reflect.deleteProperty(row, "created_by");
  Reflect.deleteProperty(row, "password");
  return row;
}

async function syncCollection<T extends { id: string }>(
  client: SupabaseClient,
  table: string,
  before: T[],
  after: T[],
  options: { skipUpdate?: (oldRow: T, newRow: T) => boolean; skipInsert?: (row: T) => boolean; skipDelete?: (row: T) => boolean } = {},
) {
  const oldById = new Map(before.map((item) => [item.id, item]));
  const newById = new Map(after.map((item) => [item.id, item]));
  for (const item of after) {
    const old = oldById.get(item.id);
    if (!old) {
      if (options.skipInsert?.(item)) continue;
      const { error } = await client.from(table).insert(toRow(table, item));
      fail(error);
    } else if (!same(old, item) && !options.skipUpdate?.(old, item)) {
      const payload = toRow(table, item);
      Reflect.deleteProperty(payload, "id");
      const { error } = await client.from(table).update(payload).eq("id", item.id);
      fail(error);
    }
  }
  for (const item of before) {
    if (!newById.has(item.id) && !options.skipDelete?.(item)) {
      const { error } = await client.from(table).delete().eq("id", item.id);
      fail(error);
    }
  }
}

async function syncPayments(client: SupabaseClient, before: Payment[], after: Payment[]) {
  const previous = new Map(before.map((payment) => [payment.id, payment]));
  const inserted = after.filter((payment) => !previous.has(payment.id));
  const bundles = new Map<string, Payment[]>();
  for (const payment of inserted) {
    const key = payment.bundle ?? payment.id;
    bundles.set(key, [...(bundles.get(key) ?? []), payment]);
  }
  for (const group of bundles.values()) {
    const { data: code, error: codeError } = await client.rpc("next_payment_code");
    fail(codeError);
    for (const payment of group) {
      const payload = toRow("payments", payment);
      payload.code = code;
      const { error } = await client.from("payments").insert(payload);
      fail(error);
    }
  }
  for (const payment of after) {
    const old = previous.get(payment.id);
    if (old && !same(old, payment) && !old.voided && payment.voided) {
      const { error } = await client.from("payments").update({ voided: true, void_reason: payment.void_reason }).eq("id", payment.id);
      fail(error);
    }
  }
}

export async function persistChanges(before: DB, after: DB) {
  const client = getSupabase();
  const newCalls = after.leadCalls.filter((call) => !before.leadCalls.some((old) => old.id === call.id));
  const callsByLead = new Map<string, LeadCall[]>();
  for (const call of newCalls) callsByLead.set(call.lead_id, [...(callsByLead.get(call.lead_id) ?? []), call]);

  await syncCollection(client, "settings", [before.settings as unknown as { id: string }], [after.settings as unknown as { id: string }]);
  await syncCollection(client, "services", before.services, after.services);
  await syncCollection(client, "therapists", before.therapists, after.therapists);
  const leadOptions = {
    skipUpdate: (old: Lead, next: Lead) => callsByLead.has(next.id) && old.call_attempts !== next.call_attempts,
  };
  await syncCollection(client, "leads", before.leads, after.leads, {
    skipUpdate: () => true,
    skipDelete: () => true,
  });
  await syncCollection(client, "children", before.children, after.children);
  await syncCollection(client, "leads", before.leads, after.leads, {
    ...leadOptions,
    skipInsert: () => true,
  });
  for (const [leadId, calls] of callsByLead) {
    for (const call of calls) {
      const lead = after.leads.find((item) => item.id === leadId);
      const { error } = await client.rpc("log_lead_call", {
        p_lead: leadId,
        p_outcome: call.outcome,
        p_note: call.note,
        p_next_at: lead?.next_call_at ?? null,
        p_assessment_at: lead?.assessment_at ?? null,
      });
      fail(error);
    }
  }
  await syncPayments(client, before.payments, after.payments);
  await syncCollection(client, "expenses", before.expenses, after.expenses);
  await syncCollection(client, "reminder_log", before.reminders, after.reminders);
  await syncCollection(client, "profiles", before.profiles, after.profiles, {
    skipUpdate: (old, next) => old.active !== next.active,
  });
  for (const profile of after.profiles) {
    const old = before.profiles.find((item) => item.id === profile.id);
    if (old && old.active !== profile.active) {
      const { error } = await setLoginActive(profile.id, profile.active);
      fail(error);
    }
  }
}

export function emptyDatabase(): DB {
  return {
    settings: EMPTY_SETTINGS, services: [], therapists: [], profiles: [], leads: [], leadCalls: [],
    children: [], payments: [], expenses: [], reminders: [], activity: [],
    seq: { lead: 0, child: 0, payment: 0, activity: 0 },
  };
}
