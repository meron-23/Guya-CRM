import { tx, txn } from "./tr";
import type { Balance, Child, Service } from "@/lib/types";
import { addDays, addMonths, daysBetween, fmtDate, monthStart, todayISO } from "@/lib/format";

export type PayStatus = "paid" | "partial" | "unpaid" | "none";

export interface BillingInfo {
  status: PayStatus;
  owes: number;
  arrears: number;
  dueThisMonth: number;
  paidThisMonth: number;
  fee: number;
  late: boolean;
  daysLate: number;
  dueDate: string | null; // the relevant due date (this month or next)
  dueLabel: string;
  remindFrom: string | null;
}

export function dueDateFor(monthISO: string, dueDay: number) {
  return addDays(monthISO, dueDay - 1);
}

export function billing(child: Child, service: Service | undefined, bal: Balance | undefined, dueDay: number, daysBefore: number, today = todayISO()): BillingInfo {
  const thisDue = dueDateFor(monthStart(today), dueDay);
  const nextDue = dueDateFor(addMonths(today, 1), dueDay);
  const none: BillingInfo = {
    status: "none", owes: 0, arrears: 0, dueThisMonth: 0, paidThisMonth: 0, fee: Number(child.monthly_fee), late: false, daysLate: 0,
    dueDate: null, dueLabel: child.status === "waiting" ? tx("On waiting list") : child.status === "left" ? tx("Left") : service?.billing === "one_time" ? tx("One-time service") : tx("No monthly fee"), remindFrom: null,
  };
  if (!bal || !service || service.billing === "one_time" || child.status === "waiting") return none;
  const owes = Number(bal.owes), arrears = Number(bal.arrears), due = Number(bal.due_this_month), paid = Number(bal.paid_this_month);
  const fee = Number(bal.monthly_fee);
  let status: PayStatus = owes <= 0 ? "paid" : paid > 0 && arrears <= 0 ? "partial" : "unpaid";
  if (child.status === "left" && owes <= 0) status = "none";
  const lateThis = due > 0 && today > thisDue;
  const late = arrears > 0 || lateThis;
  const daysLate = arrears > 0 ? Math.max(daysBetween(dueDateFor(addMonths(today, -1), dueDay), today), 1) : lateThis ? daysBetween(thisDue, today) : 0;
  let dueLabel: string, dueDate: string | null;
  if (child.status === "left") {
    dueDate = null;
    dueLabel = owes > 0 ? tx("Left · still owes") : tx("Left");
  } else if (owes <= 0) {
    dueDate = nextDue;
    dueLabel = fmtDate(nextDue);
  } else if (arrears > 0) {
    dueDate = thisDue;
    dueLabel = tx("Overdue · earlier months");
  } else if (lateThis) {
    dueDate = thisDue;
    dueLabel = txn(daysLate, "{n} day late", "{n} days late");
  } else {
    dueDate = thisDue;
    dueLabel = tx("Due {date}", { date: fmtDate(thisDue) });
  }
  const remindFrom = owes > 0 ? (late ? today : dueDateFor(monthStart(today), Math.max(1, dueDay - daysBefore))) : null;
  return { status, owes, arrears, dueThisMonth: due, paidThisMonth: paid, fee, late, daysLate, dueDate, dueLabel, remindFrom };
}
