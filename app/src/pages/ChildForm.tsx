import { tx } from "@/lib/tr";
import { DateField } from "../DateField";
import { useState } from "react";
import { Users } from "lucide-react";
import { planTotal, proRate, QTY_LABEL, serviceMonthly, UNIT, useStore, isRecurring, DEFAULT_QTY } from "../store";
import { PageHeader, useApp } from "../ui";
import { dayOfMonth, fmtDate, fmtMonth, money, todayISO } from "@/lib/format";
import type { Child } from "@/lib/types";

export default function ChildForm() {
  const { db, update, newId, isPartner } = useStore();
  const { go, route, toast, t } = useApp();
  const child = db.children.find((c) => c.id === route.params.id);
  const lead = db.leads.find((l) => l.id === route.params.lead);
  const today = todayISO();
  const leadIds = lead?.service_ids?.length ? lead.service_ids : lead?.service_id ? [lead.service_id] : [];
  const [f, setF] = useState({
    name: child?.name ?? lead?.child_name ?? "", date_of_birth: child?.date_of_birth ?? "", gender: child?.gender ?? "",
    parent_name: child?.parent_name ?? lead?.parent_name ?? "", relationship: child?.relationship ?? lead?.relationship ?? "", phone: child?.phone ?? lead?.phone ?? "",
    telegram: child?.telegram ?? lead?.telegram ?? "", preferred_channel: child?.preferred_channel ?? lead?.preferred_channel ?? "call",
    has_whatsapp: child?.has_whatsapp ?? lead?.has_whatsapp ?? false, second_contact_name: child?.second_contact_name ?? "", second_contact_phone: child?.second_contact_phone ?? "",
    therapist_id: child?.therapist_id ?? "", schedule: child?.schedule ?? "",
    monthly_fee: child ? String(child.monthly_fee) : String(planTotal(db, leadIds) || ""),
    status: child?.status ?? "active", joined_on: child?.joined_on ?? today, left_on: child?.left_on ?? today,
    notes: child?.notes ?? [lead?.concern, lead?.notes].filter(Boolean).join("\n"),
  });
  const [ids, setIds] = useState<string[]>(child?.service_ids ?? leadIds);
  const [qty, setQty] = useState<Record<string, number>>(child?.service_qty ?? {});
  const [firstMode, setFirstMode] = useState<"prorate" | "full" | "free" | "custom">(child ? (child.first_month_fee == null ? "full" : "custom") : "prorate");
  const [firstCustom, setFirstCustom] = useState(child?.first_month_fee != null ? String(child.first_month_fee) : "");
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const chosen = db.services.filter((s) => ids.includes(s.id));
  const anyMonthly = chosen.some(isRecurring);
  const feeLocked = !!child && !isPartner;
  function toggleService(id: string) {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    setIds(next);
    if (!feeLocked) setF((cur) => ({ ...cur, monthly_fee: String(planTotal(db, next, qty)) }));
  }
  function setQ(id: string, n: number) {
    const next = { ...qty, [id]: Math.max(0, Math.min(200, n)) };
    setQty(next);
    if (!feeLocked) setF((cur) => ({ ...cur, monthly_fee: String(planTotal(db, ids, next)) }));
  }
  const planSum = planTotal(db, ids, qty);
  const feeNum = Number(String(f.monthly_fee).replace(/,/g, "")) || 0;
  const { day: startDay, days: monthDays } = dayOfMonth(f.joined_on || todayISO());
  const prorated = proRate(feeNum, f.joined_on || today);
  const firstFee = !anyMonthly ? null : firstMode === "prorate" ? (startDay > 1 ? prorated : null) : firstMode === "full" ? null : firstMode === "free" ? 0 : Number(firstCustom.replace(/,/g, "")) || 0;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setError(tx("Child's name is required"));
    if (!f.parent_name.trim()) return setError(tx("Parent's name is required"));
    if (f.phone.replace(/\D/g, "").length < 9) return setError(tx("Enter the parent's full phone number"));
    if (!ids.length) return setError(tx("Choose at least one service"));
    const fee = anyMonthly ? feeNum : 0;
    if (!Number.isFinite(fee) || fee < 0) return setError(tx("Enter the monthly fee as a number"));
    if (!f.joined_on) return setError(tx("Pick the start date"));
    const data = {
      ...f, name: f.name.trim(), parent_name: f.parent_name.trim(), telegram: f.telegram.replace(/^@/, ""), date_of_birth: f.date_of_birth || null,
      therapist_id: f.therapist_id || null, monthly_fee: fee, left_on: f.status === "left" ? f.left_on : null,
      service_ids: ids, service_qty: Object.fromEntries(ids.filter((id) => qty[id] != null || ["per_session", "per_hour"].includes(db.services.find((x) => x.id === id)?.billing ?? "")).map((id) => [id, qty[id] ?? DEFAULT_QTY])), service_id: ids[0] ?? null, first_month_fee: (feeLocked ? child?.first_month_fee ?? null : firstFee),
    } as unknown as Partial<Child>;
    if (child) {
      update((d) => Object.assign(d.children.find((c) => c.id === child.id)!, data), ["Updated {name} ({code})", { name: data.name ?? "", code: child.code }]);
      toast(tx("Child updated")); go("children", { open: child.id });
    } else {
      const id = newId();
      update((d) => {
        const code = `GU-${String(++d.seq.child).padStart(3, "0")}`;
        d.children.push({ ...(data as Child), id, code, lead_id: lead?.id ?? null, created_at: new Date().toISOString() });
        if (lead) { const l = d.leads.find((x) => x.id === lead.id)!; l.status = "registered"; l.child_id = id; l.next_call_at = null; }
      }, ["Registered {name}", { name: data.name ?? "" }]);
      toast(tx("Child registered")); go("children", { open: id });
    }
  }
  const groups = [["therapy", tx("Therapy")], ["daycare", tx("Day care")], ["assessment", tx("Assessment")]] as const;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader icon={Users} tone="leaf" title={child ? tx("Edit {name}", { name: child.name }) : t("children.add")} subtitle={child ? child.code : lead ? tx("From enquiry {code} — details copied over", { code: lead.code }) : tx("Register a new child at the centre")} />
      <form onSubmit={save} className="card flex flex-col gap-6 p-5 md:p-7" noValidate>
        {error && <p role="alert" className="rounded-xl bg-danger-light px-4 py-3 text-sm text-danger">{error}</p>}
        <fieldset className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <legend className="eyebrow mb-3 text-leaf">{tx("Child")}</legend>
          <label className="label">{tx("Full name *")}<input className="input" value={f.name} onChange={set("name")} /></label>
          <DateField label={tx("Date of birth")} max={today} value={f.date_of_birth} onChange={(v) => setF({ ...f, date_of_birth: v })} placeholder={tx("Not given")} />
          <label className="label">{tx("Gender")}<select className="input" value={f.gender} onChange={set("gender")}><option value="">—</option><option value="male">{tx("Boy")}</option><option value="female">{tx("Girl")}</option></select></label>
        </fieldset>
        <fieldset className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <legend className="eyebrow mb-3 text-sky">{tx("Parent / guardian")}</legend>
          <label className="label">{tx("Name *")}<input className="input" value={f.parent_name} onChange={set("parent_name")} /></label>
          <label className="label">{tx("Relationship")}<input className="input" value={f.relationship} onChange={set("relationship")} placeholder={tx("Mother, father…")} /></label>
          <label className="label">{tx("Phone *")}<input className="input" type="tel" value={f.phone} onChange={set("phone")} placeholder="09…" /></label>
          <label className="label">{tx("Telegram username")}<input className="input" value={f.telegram} onChange={set("telegram")} placeholder={tx("@username (optional)")} /></label>
          <label className="label">{tx("Prefers")}<select className="input" value={f.preferred_channel} onChange={set("preferred_channel")}><option value="call">{tx("Phone call")}</option><option value="whatsapp">{tx("WhatsApp")}</option><option value="telegram">{tx("Telegram")}</option></select></label>
          <label className="flex min-h-11 items-center gap-3 self-end text-sm"><input type="checkbox" checked={f.has_whatsapp} onChange={(e) => setF({ ...f, has_whatsapp: e.target.checked })} className="h-5 w-5 accent-[#1f6e7f]" /> {tx("Has WhatsApp on this number")}</label>
          <label className="label">{tx("Second contact (optional)")}<input className="input" value={f.second_contact_name} onChange={set("second_contact_name")} placeholder={tx("Name")} /></label>
          <label className="label">{tx("Second contact phone")}<input className="input" type="tel" value={f.second_contact_phone} onChange={set("second_contact_phone")} /></label>
        </fieldset>
        <fieldset className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <legend className="eyebrow mb-3 text-plum">{tx("Service & fee")}</legend>
          <div className="flex flex-col gap-2 md:col-span-2">
            <span className="text-[13px] font-medium text-body">{tx("Services *")} <span className="font-normal text-muted">{tx("— tick every service this child gets")}</span></span>
            <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {groups.flatMap(([cat, l]) => db.services.filter((s) => s.category === cat && (s.active || ids.includes(s.id))).map((s) => {
                const on = ids.includes(s.id);
                const unitBased = s.billing === "per_session" || s.billing === "per_hour";
                const q = qty[s.id] ?? DEFAULT_QTY;
                return (
                  <div key={s.id} className={`flex flex-col rounded-xl border transition ${on ? "border-leaf bg-leaf-light shadow-sm" : "border-field bg-white hover:border-leaf"}`}>
                    <button type="button" aria-pressed={on} onClick={() => toggleService(s.id)} className="flex items-start gap-3 p-3 text-left">
                      <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-md border text-xs font-bold ${on ? "border-leaf bg-leaf text-white" : "border-field bg-white"}`}>{on ? "✓" : ""}</span>
                      <span className="min-w-0"><span className="block text-sm font-semibold">{s.name}</span>
                        <span className="text-xs text-muted">{l} · {money(s.price)} {UNIT[s.billing]}</span></span>
                    </button>
                    {on && unitBased && (
                      <div className="flex flex-col gap-1.5 border-t border-leaf/20 px-3 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <button type="button" aria-label={tx("Fewer {what}", { what: QTY_LABEL[s.billing] })} onClick={() => setQ(s.id, q - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-field bg-white text-lg leading-none">−</button>
                          <input aria-label={`${s.name} — ${QTY_LABEL[s.billing]}`} className="h-8 w-12 rounded-lg border border-field bg-white text-center text-sm font-semibold" inputMode="numeric" value={q} onChange={(e) => setQ(s.id, Number(e.target.value.replace(/\D/g, "")) || 0)} />
                          <button type="button" aria-label={tx("More {what}", { what: QTY_LABEL[s.billing] })} onClick={() => setQ(s.id, q + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-field bg-white text-lg leading-none">+</button>
                          <span className="whitespace-nowrap text-xs text-body">{QTY_LABEL[s.billing]}</span>
                        </span>
                        <span className="text-xs text-leaf-dark">{q} × {money(s.price)} = <strong>{tx("{amount} a month", { amount: money(serviceMonthly(s, { [s.id]: q })) })}</strong></span>
                      </div>
                    )}
                  </div>
                );
              }))}
            </div>
          </div>
          <label className="label">{tx("Monthly fee (ETB)")}{!anyMonthly && ` — ${tx("no monthly service chosen")}`}
            <input className="input" inputMode="decimal" value={anyMonthly ? f.monthly_fee : "0"} onChange={set("monthly_fee")} disabled={!anyMonthly} readOnly={feeLocked} />
            <span className="text-xs font-normal text-muted">{feeLocked ? tx("Only partners can change the fee.") : Number(f.monthly_fee) !== planSum ? tx("Plan total is {amount} — you've set a different fee (discount).", { amount: money(planSum) }) : chosen.filter(isRecurring).length > 1 ? tx("Total of the ticked services — change it for a discount.") : tx("Worked out from Settings prices — change it for a discount.")}</span>
          </label>
          <label className="label">{tx("Therapist")}<select className="input" value={f.therapist_id} onChange={set("therapist_id")}><option value="">{tx("Not assigned")}</option>{db.therapists.filter((x) => x.active || x.id === f.therapist_id).map((x) => <option key={x.id} value={x.id}>{x.name}{x.specialty && ` — ${x.specialty}`}</option>)}</select></label>
          <label className="label">{tx("Schedule")}<input className="input" value={f.schedule} onChange={set("schedule")} placeholder={tx("e.g. Mon, Wed, Fri 9:00")} /></label>
          <label className="label">{tx("Status")}<select className="input" value={f.status} onChange={set("status")}><option value="active">{tx("Active")}</option><option value="waiting">{tx("Waiting list")}</option><option value="left">{tx("Left the centre")}</option></select></label>
          <DateField label={tx("Start date")} required value={f.joined_on} onChange={(v) => v && setF({ ...f, joined_on: v })} hint={tx("Monthly fees count from this month.")} />
          {anyMonthly && !feeLocked && (
            <div className="flex flex-col gap-2 rounded-xl border border-gold/40 bg-gold-light p-4 md:col-span-2">
              <span className="text-[13px] font-semibold text-[#7a5a12]">{tx("First month — {month}", { month: fmtMonth(f.joined_on || today) })}</span>
              <span className="text-xs text-[#5c4410]">{startDay > 1 ? tx("Starts on {date}, partway through the month. Choose what to charge for this first month; from next month the full fee is due on day {day}.", { date: fmtDate(f.joined_on, { weekday: true }), day: db.settings.fee_due_day }) : tx("Starts at the beginning of the month — the full fee applies.")}</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([["prorate", startDay > 1 ? tx("Pro-rated · {amount}", { amount: money(prorated) }) : tx("Full · {amount}", { amount: money(feeNum) })], ["full", tx("Full month · {amount}", { amount: money(feeNum) })], ["free", tx("Free (trial)")], ["custom", tx("Other amount")]] as const).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={firstMode === k} onClick={() => setFirstMode(k)} className={`min-h-11 rounded-[10px] px-2 text-[13px] ${firstMode === k ? "bg-gold font-semibold text-white" : "border border-field bg-white"}`}>{l}</button>
                ))}
              </div>
              {firstMode === "custom" && <label className="label text-xs">{tx("First month amount (ETB)")}<input className="input h-10 w-48" inputMode="decimal" value={firstCustom} onChange={(e) => setFirstCustom(e.target.value)} /></label>}
              {startDay > 1 && firstMode === "prorate" && <span className="text-xs text-[#5c4410]">{tx("Pro-rated = {fee} × {days} days ÷ days in month, rounded to the nearest 50.", { fee: money(feeNum), days: monthDays - startDay + 1 })}</span>}
            </div>
          )}
          {f.status === "left" && <DateField label={tx("Date left")} required value={f.left_on} onChange={(v) => v && setF({ ...f, left_on: v })} />}
          <label className="label md:col-span-2">{tx("Notes")}<textarea className="input" rows={3} value={f.notes} onChange={set("notes")} /></label>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => child ? go("children", { open: child.id }) : lead ? go("leads", { open: lead.id }) : go("children")}>{tx("Cancel")}</button>
          <button className="btn btn-green">{child ? tx("Save changes") : tx("Register child")}</button>
        </div>
      </form>
    </div>
  );
}
