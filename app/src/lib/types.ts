export type Role = "partner" | "staff";
export type Channel = "call" | "whatsapp" | "telegram";

export interface Profile { id: string; full_name: string; email: string | null; username: string; role: Role; active: boolean; created_at?: string }
export interface Settings {
  id: number; branch_name: string; centre_phone: string; fee_due_day: number; reminder_days_before: number;
  call_cadence: number[]; default_language: "en" | "am"; auto_weekly_report: boolean; auto_monthly_report: boolean;
  upfront?: { months: number; pct: number }[];
  calendar?: "eth" | "greg";
}
export interface Service { id: string; category: "therapy" | "daycare" | "assessment"; name: string; description: string; billing: "monthly" | "per_session" | "per_hour" | "one_time"; price: number; active: boolean; sort: number }
export interface Therapist { id: string; name: string; specialty: string; phone: string; active: boolean }
export interface Lead {
  id: string; code: string; parent_name: string; relationship: string; phone: string; has_whatsapp: boolean; telegram: string;
  preferred_channel: Channel; child_name: string; child_age: string; service_id: string | null; service_ids: string[]; concern: string; source: string;
  area: string; notes: string; status: "open" | "assessment_booked" | "registered" | "closed"; close_reason: string | null;
  call_attempts: number; next_call_at: string | null; assessment_at: string | null; child_id: string | null; created_at: string;
}
export interface LeadCall { id: string; lead_id: string; attempt_no: number; outcome: string; note: string; called_at: string; called_by: string | null }
export interface Child {
  id: string; code: string; name: string; date_of_birth: string | null; gender: string; parent_name: string; relationship: string;
  phone: string; has_whatsapp: boolean; telegram: string; preferred_channel: Channel; second_contact_name: string; second_contact_phone: string;
  service_id: string | null; service_ids: string[]; service_qty: Record<string, number>; first_month_fee: number | null; therapist_id: string | null; schedule: string; monthly_fee: number; status: "active" | "waiting" | "left";
  joined_on: string; left_on: string | null; lead_id: string | null; notes: string; created_at: string;
}
export interface Payment {
  id: string; code: string; child_id: string; service_id: string | null; payer_name: string; amount: number; period_month: string | null;
  method: string; reference: string; screenshot?: string | null; note: string; paid_on: string; received_by: string | null; voided: boolean; void_reason: string | null; created_at: string;
  screenshot_path?: string | null;
  /** Upfront discount given on this month (counts as paid, not as money received). */ discount?: number; bundle?: string | null; bundle_months?: number;
}
export interface Balance { child_id: string; monthly_fee: number; months_billed: number; billed_this_month: boolean; paid_this_month: number; arrears: number; due_this_month: number; owes: number }
export interface Expense { id: string; category: "rent" | "salaries" | "utilities" | "misc"; description: string; amount: number; spent_on: string; method: string; note: string; created_at: string }
export interface ReminderLog { id: string; kind: "payment" | "call" | "assessment"; child_id: string | null; lead_id: string | null; channel: string; message: string; result: string; sent_by: string | null; sent_at: string }
