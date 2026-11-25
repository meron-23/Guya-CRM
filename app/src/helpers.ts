import type { Lead } from "@/lib/types";
import { dateInTZ, todayISO } from "@/lib/format";
import { useMemo } from "react";
import { balances, useStore } from "./store";
import type { Service } from "@/lib/types";
import { billing } from "@/lib/billing";
import { txLang } from "@/lib/tr";

export type LeadBucket = "today" | "overdue" | "upcoming" | "assessment" | "closed";
export function bucketOf(l: Lead, today = todayISO()): LeadBucket | null {
  if (l.status === "assessment_booked") return "assessment";
  if (l.status === "closed") return "closed";
  if (l.status !== "open") return null;
  const d = dateInTZ(l.next_call_at) || today;
  if (d < today) return "overdue";
  if (d === today) return "today";
  return "upcoming";
}

/** Children joined with their billing info, recomputed whenever data changes. */
export function useBilling() {
  const { db } = useStore();
  return useMemo(() => {
    const today = todayISO();
    const bal = balances(db, today);
    const svc = new Map(db.services.map((s) => [s.id, s]));
    const ther = new Map(db.therapists.map((t) => [t.id, t]));
    const rows = db.children.map((c) => {
      const list = c.service_ids.map((id) => svc.get(id)).filter(Boolean) as Service[];
      const billable = list.find((s) => s.billing !== "one_time") ?? list[0];
      return { c, s: list[0], services: list, th: ther.get(c.therapist_id ?? ""),
        b: billing(c, billable, bal.get(c.id), db.settings.fee_due_day, db.settings.reminder_days_before, today) };
    });
    return { rows, svc, ther, today, bal };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, txLang()]);
}
export const inRange = (iso: string, from: string, to: string) => iso >= from && iso <= to;
