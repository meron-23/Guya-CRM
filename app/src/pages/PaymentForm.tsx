import { tl, tx } from "@/lib/tr";
import { DateField } from "../DateField";
import { useState, useEffect } from "react";
import { Coins, ImagePlus, X } from "lucide-react";
import { covered, expectedFor, serviceMonthly, UNIT, upfrontOf, useStore } from "../store";
import { PageHeader, useApp } from "../ui";
import { useBilling } from "../helpers";
import { addMonths, fmtMonth, money, monthStart, todayISO } from "@/lib/format";
import { uploadScreenshot } from "@/lib/supabase";

const METHODS = [["telebirr", tl("Telebirr")], ["cbe", tl("CBE")], ["cash", tl("Cash")], ["bank", tl("Bank")], ["other", tl("Other")]] as const;

export default function PaymentForm() {
  const { db, update, newId, me, userId } = useStore();
  const { go, route, toast, t } = useApp();
  const { rows } = useBilling();
  const today = todayISO(), thisMonth = monthStart(today);
  const kids = rows.filter((r) => r.c.status !== "left" || r.b.owes > 0).sort((a, b) => a.c.name.localeCompare(b.c.name));

  const suggest = (childId: string, serviceId?: string) => {
    const r = rows.find((x) => x.c.id === childId);
    if (!r) return { amount: "", month: thisMonth, service: "" };
    const monthlyIds = r.c.service_ids.filter((id) => { const b = db.services.find((x) => x.id === id)?.billing; return !!b && b !== "one_time"; });
    const sid = serviceId ?? (monthlyIds.length > 1 ? "all" : r.c.service_ids[0] ?? "");
    const s = db.services.find((x) => x.id === sid);
    if (s?.billing === "one_time") return { amount: s.price ? String(s.price) : "", month: thisMonth, service: sid };
    let month = thisMonth;
    if (r.b.owes > 0) {
      for (let m = monthStart(r.c.joined_on); m <= thisMonth; m = addMonths(m, 1)) {
        const paid = db.payments.filter((p) => p.child_id === childId && !p.voided && p.period_month === m).reduce((a, p) => a + covered(p), 0);
        if (paid < expectedFor(r.c, m)) { month = m; break; }
      }
    }
    const paidM = db.payments.filter((p) => p.child_id === childId && !p.voided && p.period_month === month).reduce((a, p) => a + covered(p), 0);
    let amt = r.b.owes > 0 ? Math.max(expectedFor(r.c, month) - paidM, 0) : Number(r.c.monthly_fee);
    if (s && monthlyIds.length > 1) amt = Math.min(amt || Infinity, serviceMonthly(s, r.c.service_qty));
    return { amount: amt ? String(amt) : "", month, service: sid };
  };
  const init = suggest(route.params.child ?? "");
  const [childId, setChildId] = useState(route.params.child ?? "");
  const [serviceId, setServiceId] = useState(init.service);
  const [amount, setAmount] = useState(init.amount);
  const [month, setMonth] = useState(init.month);
  const [method, setMethod] = useState<string>("telebirr");
  const [payer, setPayer] = useState(rows.find((r) => r.c.id === childId)?.c.parent_name ?? "");
  const [reference, setReference] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [shotBusy, setShotBusy] = useState(false);
  async function onFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError(tx("Please choose a photo or screenshot"));
    setShotBusy(true);
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
      const scale = Math.min(1, 900 / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
      cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
      setShot(cv.toDataURL("image/jpeg", 0.7)); setError("");
      URL.revokeObjectURL(url);
    } catch { setError(tx("Could not read that image — try another one")); }
    setShotBusy(false);
  }
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const row = rows.find((r) => r.c.id === childId);
  const svc = db.services.find((s) => s.id === serviceId);
  const monthly = serviceId === "all" || (svc?.billing ?? "monthly") !== "one_time";
  const unitBased = svc?.billing === "per_session" || svc?.billing === "per_hour";
  const [units, setUnits] = useState<number | null>(null);
  const childServices = db.services.filter((s) => row?.c.service_ids.includes(s.id));
  const otherServices = db.services.filter((s) => s.active && !row?.c.service_ids.includes(s.id));
  const needsShot = ["telebirr", "cbe", "bank"].includes(method);
  const months = Array.from({ length: 9 }, (_, i) => addMonths(today, i - 6));
  /* Upfront: pay several months at once for a discount (only for the whole monthly fee). */
  const [ahead, setAhead] = useState(1);
  const monthlyIdsOf = row ? row.c.service_ids.filter((id) => { const b = db.services.find((x) => x.id === id)?.billing; return !!b && b !== "one_time"; }) : [];
  const canAhead = !!row && monthly && row.c.status !== "left" && (serviceId === "all" || (monthlyIdsOf.length === 1 && monthlyIdsOf[0] === serviceId));
  const tiers = upfrontOf(db);
  const pct = tiers.find((x) => x.months === ahead)?.pct ?? 0;
  const plan = canAhead && ahead > 1 ? (() => {
    const list = Array.from({ length: ahead }, (_, i) => addMonths(month, i)).map((m) => {
      const paidM = db.payments.filter((p) => p.child_id === childId && !p.voided && p.period_month === m).reduce((a, p) => a + covered(p), 0);
      return { m, due: Math.max(expectedFor(row!.c, m) - paidM, 0) };
    });
    const total = list.reduce((a, x) => a + x.due, 0);
    const off = Math.round((total * pct) / 100);
    let left = total - off;
    const rowsOut = list.map((x, i) => { const disc = i === list.length - 1 ? x.due - left : Math.round((x.due * pct) / 100); const amt = x.due - disc; left -= i === list.length - 1 ? 0 : amt; return { ...x, amount: amt, discount: disc }; });
    return { list: rowsOut, total, off, pay: total - off };
  })() : null;
  function pickAhead(n: number) {
    setAhead(n);
    if (n === 1) { const s = suggest(childId, serviceId); setAmount(s.amount); }
  }
  const planPay = plan?.pay;
  useEffect(() => { if (planPay != null) setAmount(String(planPay)); }, [planPay]);

  function pickChild(id: string) {
    const s = suggest(id);
    setChildId(id); setServiceId(s.service); setAmount(s.amount); setMonth(s.month); setAhead(1);
    setPayer(rows.find((r) => r.c.id === id)?.c.parent_name ?? "");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount.replace(/,/g, ""));
    if (!childId) return setError(tx("Choose the child"));
    if (!serviceId) return setError(tx("Choose what the payment is for"));
    if (!Number.isFinite(amt) || amt <= 0) return setError(tx("Enter the amount"));
    if (needsShot && !shot) return setError(tx("Add a screenshot of the payment so it can be checked later"));
    if (plan && plan.pay <= 0) return setError(tx("These months are already paid"));
    let screenshotPath: string | null = null;
    try {
      if (shot) screenshotPath = await uploadScreenshot(shot, childId);
    } catch (reason) {
      return setError(reason instanceof Error ? reason.message : String(reason));
    }
    const id = newId();
    let code = "";
    if (plan) {
      update((d) => {
        code = `P-${String(++d.seq.payment).padStart(4, "0")}`;
        plan.list.forEach((x, i) => d.payments.push({ id: i === 0 ? id : newId(), code, child_id: childId, service_id: serviceId === "all" ? null : serviceId, payer_name: payer.trim(), amount: x.amount, discount: x.discount, bundle: id, bundle_months: ahead, period_month: x.m, method, reference: reference.trim(), screenshot: screenshotPath, screenshot_path: screenshotPath, note: note.trim(), paid_on: paidOn, received_by: userId, voided: false, void_reason: null, created_at: new Date().toISOString() }));
      }, ["Payment · {name} · {amount}", { name: row?.c.name ?? "", amount: plan.pay }]);
      toast(tx("Payment saved")); go("receipt", { id, fresh: "1" }); return;
    }
    update((d) => {
      code = `P-${String(++d.seq.payment).padStart(4, "0")}`;
      d.payments.push({ id, code, child_id: childId, service_id: serviceId === "all" ? null : serviceId, payer_name: payer.trim(), amount: amt, period_month: monthly ? month : null, method, reference: reference.trim(), screenshot: screenshotPath, screenshot_path: screenshotPath, note: note.trim(), paid_on: paidOn, received_by: userId, voided: false, void_reason: null, created_at: new Date().toISOString() });
    }, ["Payment · {name} · {amount}", { name: row?.c.name ?? "", amount: amt }]);
    toast(tx("Payment saved")); go("receipt", { id, fresh: "1" });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader icon={Coins} tone="leaf" title={t("pay.record")} subtitle={tx("Log money a parent has paid you.")} />
      <form onSubmit={save} className="card flex flex-col gap-5 p-5 md:p-7" noValidate>
        {error && <p role="alert" className="rounded-xl bg-danger-light px-4 py-3 text-sm text-danger">{error}</p>}
        <label className="label">{tx("Child *")}
          <select className="input" value={childId} onChange={(e) => pickChild(e.target.value)}>
            <option value="" disabled>{tx("Choose a child…")}</option>
            {kids.map((k) => <option key={k.c.id} value={k.c.id}>{k.c.name} · {k.c.code}{k.b.owes > 0 ? ` — ${tx("owes {amount}", { amount: money(k.b.owes) })}` : ""}</option>)}
          </select>
        </label>
        {row && (
          <div className={`rounded-xl px-4 py-3 text-sm ${row.b.owes > 0 ? "bg-amber-light text-warn-dark" : "bg-leaf-light text-leaf-dark"}`}>
            {row.b.owes > 0 ? <>{tx("Owes")} <strong>{money(row.b.owes)}</strong>{row.b.arrears > 0 && <> ({tx("incl. {amount} from earlier months", { amount: money(row.b.arrears) })})</>}</> : tx("Nothing owed right now — this will count as an advance payment.")}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="label">{tx("Paid by")}<input className="input" value={payer} onChange={(e) => setPayer(e.target.value)} placeholder={tx("Parent's name")} /></label>
          <label className="label">{tx("Paid for *")}
            <select className="input" value={serviceId} onChange={(e) => { const s = suggest(childId, e.target.value); setServiceId(e.target.value); setAmount(s.amount); setMonth(s.month); setUnits(null); setAhead(1); }}>
              <option value="" disabled>{tx("Choose…")}</option>
              {childServices.filter((x) => x.billing !== "one_time").length > 1 && <option value="all">{tx("Monthly fee — all services")}</option>}
              {childServices.length > 0 && <optgroup label={tx("This child's services")}>{childServices.map((x) => <option key={x.id} value={x.id}>{x.name} — {money(x.price)} {UNIT[x.billing]}</option>)}</optgroup>}
              <optgroup label={tx("Other services")}>{otherServices.map((x) => <option key={x.id} value={x.id}>{x.name} — {money(x.price)} {UNIT[x.billing]}</option>)}</optgroup>
            </select>
          </label>
          {canAhead && (
            <div className="flex flex-col gap-2 rounded-xl border border-leaf/30 bg-leaf-light/60 p-3.5 md:col-span-2">
              <span className="text-[13px] font-semibold text-leaf-dark">{tx("How many months are they paying for?")}</span>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label={tx("Months paid")}>
                {[{ months: 1, pct: 0 }, ...tiers].map((o) => (
                  <button key={o.months} type="button" aria-pressed={ahead === o.months} onClick={() => pickAhead(o.months)} className={`flex flex-col items-center rounded-[10px] px-2 py-2 text-sm transition ${ahead === o.months ? "bg-leaf font-semibold text-white shadow" : "border border-field bg-white hover:border-leaf"}`}>
                    <span>{o.months === 1 ? tx("1 month") : tx("{n} months", { n: o.months })}</span>
                    <span className={`text-[11px] ${ahead === o.months ? "text-white/85" : "text-leaf-dark"}`}>{o.pct ? tx("{p}% off", { p: o.pct }) : tx("Normal")}</span>
                  </button>
                ))}
              </div>
              {plan && (
                <div className="flex flex-col gap-1 text-[13px] text-body">
                  <span>{fmtMonth(plan.list[0].m)} – {fmtMonth(plan.list[plan.list.length - 1].m)}: {money(plan.total)} − {tx("{p}% upfront discount", { p: pct })} <strong className="text-leaf-dark">{money(plan.off)}</strong></span>
                  <span className="text-base font-bold text-ink">{tx("To pay: {amount}", { amount: money(plan.pay) })}</span>
                  <span className="text-xs text-muted">{tx("All {n} months will show as paid. The discount is recorded so partners can see it.", { n: ahead })}</span>
                </div>
              )}
            </div>
          )}
          <label className="label">{tx("Amount (ETB) *")}<input className="input text-lg font-semibold" inputMode="decimal" value={amount} readOnly={!!plan} onChange={(e) => setAmount(e.target.value)} /></label>
          {unitBased && svc && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-plum-light px-4 py-3 text-sm md:col-span-2">
              <span className="font-medium text-plum">{svc.billing === "per_hour" ? tx("Paying by the hour?") : tx("Paying by the session?")}</span>
              <button type="button" aria-label={tx("One less")} onClick={() => { const n = Math.max(1, (units ?? 1) - 1); setUnits(n); setAmount(String(n * Number(svc.price))); }} className="flex h-8 w-8 items-center justify-center rounded-lg border border-field bg-white">−</button>
              <input aria-label={svc.billing === "per_hour" ? tx("Hours paid for") : tx("Sessions paid for")} className="h-8 w-12 rounded-lg border border-field bg-white text-center font-semibold" inputMode="numeric" value={units ?? ""} placeholder="—" onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")) || 0; setUnits(n); setAmount(String(n * Number(svc.price))); }} />
              <button type="button" aria-label={tx("One more")} onClick={() => { const n = (units ?? 0) + 1; setUnits(n); setAmount(String(n * Number(svc.price))); }} className="flex h-8 w-8 items-center justify-center rounded-lg border border-field bg-white">+</button>
              <span className="text-body">{svc.billing === "per_hour" ? tx("hours") : tx("sessions")} × {money(svc.price)}{units ? ` = ${money(units * Number(svc.price))}` : ""}</span>
            </div>
          )}
          {monthly ? (
            <label className="label">{plan ? tx("Starting month *") : tx("For month *")}<select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}</select></label>
          ) : <div className="label">{tx("For month")}<span className="flex h-11 items-center text-sm text-muted">{tx("One-time payment")}</span></div>}
          <DateField label={tx("Date paid")} required max={today} value={paidOn} onChange={(v) => setPaidOn(v || today)} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-medium text-body">{tx("Method *")}</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {METHODS.map(([v, l]) => <button key={v} type="button" aria-pressed={method === v} onClick={() => setMethod(v)} className={`h-11 rounded-[10px] text-sm ${method === v ? "bg-brand font-semibold text-white shadow" : "border border-field bg-white"}`}>{tx(l)}</button>)}
          </div>
        </fieldset>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-body">{tx("Payment screenshot")} {needsShot ? "*" : <span className="font-normal text-muted">{tx("(optional for cash — a photo of the receipt-book page)")}</span>}</span>
          {shot ? (
            <div className="relative self-start">
              <img src={shot} alt={tx("Payment screenshot")} className="max-h-64 rounded-xl border border-line shadow" />
              <button type="button" onClick={() => setShot(null)} className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white shadow" aria-label={tx("Remove screenshot")}><X size={15} /></button>
            </div>
          ) : (
            <label className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition ${needsShot ? "border-leaf/60 bg-leaf-light/50 hover:bg-leaf-light" : "border-field bg-canvas hover:border-brand"}`}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}>
              <ImagePlus size={28} className="text-leaf" aria-hidden />
              <span className="text-sm font-semibold">{shotBusy ? tx("Reading image…") : tx("Add the Telebirr / bank screenshot")}</span>
              <span className="text-xs text-muted">{tx("Take a photo, choose a screenshot, or drop the image here")}</span>
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? undefined)} />
            </label>
          )}
        </div>
        <label className="label">{tx("Transaction number")} <span className="font-normal text-muted">{tx("(optional)")}</span>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === "cash" ? tx("Receipt book number") : tx("e.g. Telebirr transaction ID")} />
        </label>
        <label className="label">{tx("Note")}<input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={tx("Optional")} /></label>
        <p className="text-xs text-muted">{tx("The screenshot is kept with the payment so partners can check it later.")} {tx("Received by {name}", { name: me.full_name })} · {tx("date and time are saved automatically")} · {tx("payments can only be voided by a partner, with a reason.")}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => go("children", childId ? { open: childId } : {})}>{tx("Cancel")}</button>
          <button className="btn btn-green">{tx("Save payment")}</button>
        </div>
      </form>
    </div>
  );
}
