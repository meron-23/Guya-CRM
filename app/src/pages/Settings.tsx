import { tx, txd, txn } from "@/lib/tr";
import { useState } from "react";
import { Copy, KeyRound, RefreshCw, SlidersHorizontal, Tag, Stethoscope, UsersRound, PhoneCall, Building2 } from "lucide-react";
import { DEFAULT_UPFRONT, makePassword, UNIT, useStore } from "../store";
import { Avatar, PageHeader, PartnersBadge, TONE, useApp, type Tone } from "../ui";
import { CATEGORY_LABEL } from "@/lib/labels";
import type { Service } from "@/lib/types";
import { createLogin as createStaffLogin } from "@/lib/supabase";

function Section({ title, sub, icon: Icon, tone, children }: { title: string; sub?: string; icon: typeof Tag; tone: Tone; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className={`flex items-center gap-3 px-5 py-3.5 ${TONE[tone].soft}`}>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${TONE[tone].solid}`}><Icon size={17} /></span>
        <div><h2 className="text-base font-semibold">{title}</h2>{sub && <p className="text-[13px] text-muted">{sub}</p>}</div>
      </div>
      <div className="flex flex-col gap-4 p-5">{children}</div>
    </section>
  );
}
const inp = "input h-10 text-sm";

export default function Settings() {
  const { rawDb: db, update, newId, userId, refresh } = useStore();
  const { t, toast } = useApp();
  const S = db.settings;
  const [ns, setNs] = useState({ name: "", category: "therapy", description: "", billing: "monthly", price: "" });
  const [nt, setNt] = useState({ name: "", specialty: "", phone: "" });
  const [nm, setNm] = useState({ full_name: "", username: "", role: "staff", password: makePassword() });
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null);
  const [nmErr, setNmErr] = useState("");
  async function createLogin(e: React.FormEvent) {
    e.preventDefault();
    const username = nm.username.trim().toLowerCase();
    if (!nm.full_name.trim()) return setNmErr(tx("Enter the person's full name"));
    if (!/^[a-z0-9._-]{3,20}$/.test(username)) return setNmErr(tx("Username: 3–20 letters or numbers, no spaces"));
    if (db.profiles.some((p) => p.username.toLowerCase() === username)) return setNmErr(tx("That username is already taken"));
    if (nm.password.length < 8) return setNmErr(tx("Password must be at least 8 characters"));
    try {
      const { data, error } = await createStaffLogin({ full_name: nm.full_name.trim(), username, password: nm.password, role: nm.role as "partner" | "staff" });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
      await refresh();
      setCreated({ name: nm.full_name.trim(), username, password: nm.password });
      setNm({ full_name: "", username: "", role: "staff", password: makePassword() }); setNmErr("");
    } catch (reason) {
      setNmErr(reason instanceof Error ? reason.message : String(reason));
    }
  }
  const [assign, setAssign] = useState({ child: "", therapist: "" });
  const [cad, setCad] = useState<string[]>(S.call_cadence.map(String));
  const cadDirty = cad.join(",") !== S.call_cadence.join(",");
  const [cadErr, setCadErr] = useState("");
  const load = new Map<string, string[]>();
  db.children.filter((c) => c.status !== "left" && c.therapist_id).forEach((c) => load.set(c.therapist_id!, [...(load.get(c.therapist_id!) ?? []), c.name]));
  const saved = () => toast(tx("Saved"));
  const setSvc = (id: string, patch: Partial<Service>) => update((d) => Object.assign(d.services.find((s) => s.id === id)!, patch));

  function saveCadence() {
    const days = cad.map((x) => x.trim()).filter((x) => x !== "").map(Number);
    if (days.length < 2) return setCadErr(tx("Use at least 2 calls"));
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 90)) return setCadErr(tx("Days must be whole numbers from 0 to 90"));
    if (days[0] !== 0) return setCadErr(tx("The first call is always day 0"));
    for (let i = 1; i < days.length; i++) if (days[i] <= days[i - 1]) return setCadErr(tx("Each call must be later than the one before"));
    setCadErr(""); update((d) => { d.settings.call_cadence = days; }, "Follow-up plan updated"); saved();
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={SlidersHorizontal} tone="slate" title={t("set.title")} badge={<PartnersBadge label={t("common.partnersOnly")} />} subtitle={tx(
        "Prices, therapists, logins and follow-up rules. Changes save as you make them."
      )} />

      <Section title={tx("Services & prices")} icon={Tag} tone="brand" sub={tx(
        "Charge per month, per session or per hour. For session and hour prices you set how many a month when you register the child. Changing a price doesn't change fees of children already registered."
      )}>
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="hidden gap-3 bg-canvas px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted md:grid md:grid-cols-[1.5fr_0.9fr_1.4fr_0.9fr_1fr_0.9fr]">
            <span>{tx("Name")}</span><span>{tx("Type")}</span><span>{tx("Details")}</span><span>{tx("Charged")}</span><span className="text-right">{tx("Price (ETB)")}</span><span>{tx("Status")}</span>
          </div>
          {db.services.map((s) => {
            const users = db.children.filter((c) => c.status !== "left" && c.service_ids.includes(s.id)).length;
            return (
            <div key={s.id} className={`grid grid-cols-2 items-center gap-3 border-t border-line-soft px-4 py-3 first:border-0 md:first:border-t md:grid-cols-[1.5fr_0.9fr_1.4fr_0.9fr_1fr_0.9fr] ${s.active ? "" : "bg-canvas/60"}`}>
              <label className="label col-span-2 text-xs md:col-span-1"><span className="md:sr-only">{tx("Name")}</span><input className={`${inp} font-semibold`} defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && (setSvc(s.id, { name: e.target.value.trim() }), saved())} /><span className="text-[11px] font-normal text-muted">{txd(s.name) !== s.name ? `${txd(s.name)} · ` : ""}{txn(users, "1 child", "{n} children")}</span></label>
              <label className="label text-xs"><span className="md:sr-only">{tx("Type")}</span><select className={inp} value={s.category} onChange={(e) => { setSvc(s.id, { category: e.target.value as Service["category"] }); saved(); }}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="label text-xs"><span className="md:sr-only">{tx("Details")}</span><input className={inp} defaultValue={s.description} onBlur={(e) => e.target.value !== s.description && (setSvc(s.id, { description: e.target.value }), saved())} /></label>
              <label className="label text-xs"><span className="md:sr-only">{tx("Charged")}</span><select className={inp} value={s.billing} onChange={(e) => { setSvc(s.id, { billing: e.target.value as Service["billing"] }); saved(); }}><option value="monthly">{tx("Per month")}</option><option value="per_session">{tx("Per session")}</option><option value="per_hour">{tx("Per hour")}</option><option value="one_time">{tx("One time")}</option></select></label>
              <label className="label text-xs"><span className="md:sr-only">{tx("Price (ETB)")}</span>
                <span className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted">{tx("ETB")}</span><input className={`${inp} pl-11 text-right font-semibold`} inputMode="decimal" defaultValue={Number(s.price).toLocaleString("en-US")} onBlur={(e) => { const v = Number(e.target.value.replace(/,/g, "")); if (Number.isFinite(v) && v >= 0 && v !== Number(s.price)) { update((d) => { d.services.find((x) => x.id === s.id)!.price = v; }, ["Updated service · {name}", { name: s.name }]); saved(); } }} /></span>
                <span className="text-right text-[11px] font-normal text-muted">{UNIT[s.billing]}</span></label>
              <span className="flex items-center gap-2">
                <button type="button" role="switch" aria-checked={s.active} aria-label={tx("{name} is offered", { name: s.name })} onClick={() => { setSvc(s.id, { active: !s.active }); saved(); }} className={`relative h-6 w-11 flex-none rounded-full transition ${s.active ? "bg-leaf" : "bg-field"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${s.active ? "left-[22px]" : "left-0.5"}`} /></button>
                <span className={`text-[13px] ${s.active ? "font-medium text-leaf-dark" : "text-muted"}`}>{s.active ? tx("Offered") : tx("Hidden")}</span>
              </span>
            </div>
          ); })}
        </div>
        <form className="grid grid-cols-2 items-end gap-3 rounded-xl bg-brand-tint p-4 md:grid-cols-[1.4fr_0.9fr_1.4fr_0.9fr_0.9fr_auto]" onSubmit={(e) => { e.preventDefault(); const price = Number(ns.price.replace(/,/g, "")); if (!ns.name.trim() || !Number.isFinite(price)) return; update((d) => { d.services.push({ id: newId(), name: ns.name.trim(), category: ns.category as Service["category"], description: ns.description, billing: ns.billing as Service["billing"], price, active: true, sort: 100 }); }, ["Added service · {name}", { name: ns.name.trim() }]); setNs({ name: "", category: "therapy", description: "", billing: "monthly", price: "" }); toast(tx("Service added")); }}>
          <label className="label col-span-2 text-xs md:col-span-1">{tx("New service")}<input className={inp} value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} placeholder={tx("e.g. Physiotherapy")} /></label>
          <label className="label text-xs">{tx("Type")}<select className={inp} value={ns.category} onChange={(e) => setNs({ ...ns, category: e.target.value })}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="label text-xs">{tx("Details")}<input className={inp} value={ns.description} onChange={(e) => setNs({ ...ns, description: e.target.value })} /></label>
          <label className="label text-xs">{tx("Charged")}<select className={inp} value={ns.billing} onChange={(e) => setNs({ ...ns, billing: e.target.value })}><option value="monthly">{tx("Per month")}</option><option value="per_session">{tx("Per session")}</option><option value="per_hour">{tx("Per hour")}</option><option value="one_time">{tx("One time")}</option></select></label>
          <label className="label text-xs">{tx("Price (ETB)")}<input className={`${inp} text-right`} inputMode="decimal" value={ns.price} onChange={(e) => setNs({ ...ns, price: e.target.value })} /></label>
          <button className="btn btn-primary btn-sm h-10" disabled={!ns.name.trim() || !ns.price}>{tx("Add service")}</button>
        </form>
      </Section>

      <Section title={tx("Therapists")} icon={Stethoscope} tone="leaf" sub={tx("Assign each child to a therapist so everyone knows who is responsible.")}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {db.therapists.map((th) => (
            <div key={th.id} className={`flex flex-col gap-1.5 rounded-xl border p-4 ${th.active ? "border-[#cfe6d4] bg-mint" : "border-line bg-canvas opacity-70"}`}>
              <div className="flex items-center justify-between gap-2"><strong>{th.name}</strong>
                <button className={`pill ${th.active ? "bg-leaf text-white" : "bg-field text-body"}`} onClick={() => { update((d) => { const x = d.therapists.find((y) => y.id === th.id)!; x.active = !x.active; }); saved(); }}>{th.active ? tx("Working") : tx("Not working")}</button></div>
              <span className="text-[13px] text-body">{txd(th.specialty) || "—"}{th.phone && ` · ${th.phone}`}</span>
              <span className="text-xs text-muted">{load.get(th.id)?.length ? `${txn(load.get(th.id)!.length, "1 child", "{n} children")}: ${load.get(th.id)!.join(", ")}` : tx("No children assigned")}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <form className="grid grid-cols-1 items-end gap-3 rounded-xl bg-canvas p-4 sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); if (!nt.name.trim()) return; update((d) => { d.therapists.push({ id: newId(), name: nt.name.trim(), specialty: nt.specialty, phone: nt.phone, active: true }); }); setNt({ name: "", specialty: "", phone: "" }); toast(tx("Therapist added")); }}>
            <label className="label text-xs">{tx("Add therapist")}<input className={inp} value={nt.name} onChange={(e) => setNt({ ...nt, name: e.target.value })} placeholder={tx("Name")} /></label>
            <label className="label text-xs">{tx("Specialty")}<input className={inp} value={nt.specialty} onChange={(e) => setNt({ ...nt, specialty: e.target.value })} /></label>
            <label className="label text-xs">{tx("Phone")}<input className={inp} value={nt.phone} onChange={(e) => setNt({ ...nt, phone: e.target.value })} /></label>
            <button className="btn btn-green btn-sm h-10" disabled={!nt.name.trim()}>{tx("Add")}</button>
          </form>
          <form className="grid grid-cols-1 items-end gap-3 rounded-xl bg-canvas p-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); if (!assign.child) return; update((d) => { d.children.find((c) => c.id === assign.child)!.therapist_id = assign.therapist || null; }); setAssign({ child: "", therapist: "" }); toast(tx("Assigned")); }}>
            <label className="label text-xs">{tx("Assign a child")}<select className={inp} value={assign.child} onChange={(e) => setAssign({ ...assign, child: e.target.value })}><option value="" disabled>{tx("Choose…")}</option>{db.children.filter((c) => c.status !== "left").map((c) => <option key={c.id} value={c.id}>{c.name}{c.therapist_id ? "" : ` — ${tx("not assigned")}`}</option>)}</select></label>
            <label className="label text-xs">{tx("Therapist")}<select className={inp} value={assign.therapist} onChange={(e) => setAssign({ ...assign, therapist: e.target.value })}><option value="">{tx("Nobody")}</option>{db.therapists.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <button className="btn btn-green btn-sm h-10" disabled={!assign.child}>{tx("Assign")}</button>
          </form>
        </div>
      </Section>

      <Section title={tx("Logins & access")} icon={UsersRound} tone="amber" sub={tx(
        "Every person gets their own username and password. Partners see everything; staff never see money totals, expenses, reports or settings."
      )}>
        <div className="flex flex-col divide-y divide-line-soft">
          {db.profiles.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar name={p.full_name} size={38} />
              <span className="min-w-[160px] flex-1"><strong className="block text-sm">{p.full_name}{p.id === userId && ` (${tx("you")})`}</strong><span className="font-mono text-[13px] text-muted">@{p.username}</span></span>
              <span className={`pill ${p.role === "partner" ? "bg-brand-light text-brand-dark" : "bg-amber-light text-warn-dark"}`}>{p.role === "partner" ? tx("Partner") : tx("Staff")}</span>
              <button role="switch" aria-checked={p.active} aria-label={tx("{name} can sign in", { name: p.full_name })} disabled={p.id === userId} onClick={() => { update((d) => { d.profiles.find((x) => x.id === p.id)!.active = !p.active; }, [p.active ? "Turned off login · {name}" : "Turned on login · {name}", { name: p.full_name }]); toast(p.active ? tx("Login turned off") : tx("Login turned on")); }}
                className={`flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium disabled:opacity-50 ${p.active ? "bg-leaf-light text-leaf-dark" : "bg-danger-light text-danger"}`}>
                <span className={`h-2 w-2 rounded-full ${p.active ? "bg-leaf" : "bg-danger"}`} />{p.active ? tx("Can sign in") : tx("Turned off")}
              </button>
            </div>
          ))}
        </div>
        {created && (
          <div role="status" className="flex flex-col gap-3 rounded-xl border-2 border-leaf bg-leaf-light p-4">
            <strong className="flex items-center gap-2 text-leaf-dark"><KeyRound size={17} /> {tx("Login created for {name}", { name: created.name })}</strong>
            <div className="grid grid-cols-2 gap-3 font-mono text-sm">
              <span className="rounded-lg bg-white px-3 py-2"><span className="block font-sans text-xs text-muted">{tx("Username")}</span>{created.username}</span>
              <span className="rounded-lg bg-white px-3 py-2"><span className="block font-sans text-xs text-muted">{tx("Password")}</span>{created.password}</span>
            </div>
            <p className="text-xs text-leaf-dark">{tx("Give these to {name} now. The password can't be changed or shown again — if it's forgotten, turn this login off and create a new one.", { name: created.name.split(" ")[0] })}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm btn-green" onClick={() => navigator.clipboard?.writeText(tx("Guya platform login\nUsername: {u}\nPassword: {p}", { u: created.username, p: created.password })).then(() => toast(tx("Login copied")), () => {})}><Copy size={14} /> {tx("Copy login")}</button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setCreated(null)}>{tx("Done")}</button>
            </div>
          </div>
        )}
        <form className="flex flex-col gap-3 rounded-xl bg-amber-light/60 p-4" onSubmit={createLogin} noValidate>
          <strong className="text-sm">{tx("Create a login")}</strong>
          {nmErr && <p role="alert" className="text-[13px] text-danger">{nmErr}</p>}
          <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1.3fr_1fr_0.8fr_1.2fr_auto]">
            <label className="label text-xs">{tx("Full name")}<input className={inp} value={nm.full_name} onChange={(e) => { const v = e.target.value; setNm((c) => ({ ...c, full_name: v, username: c.username && c.username !== c.full_name.split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "") ? c.username : v.split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "") })); }} placeholder={tx("e.g. Hana Bekele")} /></label>
            <label className="label text-xs">{tx("Username")}<input className={`${inp} font-mono`} autoCapitalize="none" value={nm.username} onChange={(e) => setNm({ ...nm, username: e.target.value.toLowerCase().replace(/\s/g, "") })} placeholder="hana" /></label>
            <label className="label text-xs">{tx("Role")}<select className={inp} value={nm.role} onChange={(e) => setNm({ ...nm, role: e.target.value })}><option value="staff">{tx("Staff")}</option><option value="partner">{tx("Partner")}</option></select></label>
            <label className="label text-xs">{tx("Password")}
              <span className="flex gap-1.5"><input className={`${inp} flex-1 font-mono`} value={nm.password} onChange={(e) => setNm({ ...nm, password: e.target.value })} />
                <button type="button" aria-label={tx("Make a new password")} title={tx("Make a new password")} onClick={() => setNm({ ...nm, password: makePassword() })} className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-field bg-white"><RefreshCw size={15} /></button></span>
            </label>
            <button className="btn btn-sm h-10 bg-amber text-white">{tx("Create login")}</button>
          </div>
          <p className="text-xs text-muted">{tx(
            "Passwords are fixed: nobody can change them later, including the person themselves."
          )}</p>
        </form>
      </Section>

      <Section title={tx("Lead follow-up plan")} icon={PhoneCall} tone="sky" sub={tx(
        "Days after the enquiry when each call is due. After the last missed call the lead closes as “No response”."
      )}>
        <ol className="flex flex-wrap items-start gap-y-4" aria-label={tx("Lead follow-up plan")}>
          {cad.map((d, i) => (
            <li key={i} className="flex items-start">
              {i > 0 && <span aria-hidden className="mt-[22px] h-0.5 w-6 bg-sky/40 sm:w-8" />}
              <div className="flex w-[92px] flex-col items-center gap-1.5 text-center">
                <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-sky text-sm font-bold text-white shadow">
                  {i + 1}
                  {i > 0 && cad.length > 2 && <button type="button" aria-label={tx("Remove call {n}", { n: i + 1 })} onClick={() => setCad(cad.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-white text-xs text-muted shadow-sm hover:text-danger">×</button>}
                </span>
                <span className="text-[11px] font-semibold text-body">{tx("Call {n}", { n: i + 1 })}</span>
                {i === 0 ? <span className="flex h-8 items-center rounded-lg bg-sky-light px-2 text-[11px] font-medium text-sky">{tx("Same day")}</span> : (
                  <label className="flex items-center gap-1 text-[11px] text-muted">{tx("Day")}<input className="h-8 w-12 rounded-lg border border-field bg-white text-center text-sm font-semibold text-ink" inputMode="numeric" value={d} aria-label={tx("Day of call {n}", { n: i + 1 })} onChange={(e) => setCad(cad.map((x, j) => (j === i ? e.target.value.replace(/\D/g, "") : x)))} /></label>
                )}
              </div>
            </li>
          ))}
          {cad.length < 8 && (
            <li className="flex items-start">
              <span aria-hidden className="mt-[22px] h-0.5 w-6 border-t-2 border-dashed border-sky/40 sm:w-8" />
              <button type="button" onClick={() => setCad([...cad, String(Number(cad[cad.length - 1] || 0) + 7)])} className="flex w-[92px] flex-col items-center gap-1.5 text-center text-sky">
                <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-sky text-lg">+</span>
                <span className="text-[11px] font-semibold">{tx("Add a call")}</span>
              </button>
            </li>
          )}
          <li className="flex items-start">
            <span aria-hidden className="mt-[22px] h-0.5 w-6 bg-line sm:w-8" />
            <div className="flex w-[92px] flex-col items-center gap-1.5 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-canvas text-muted ring-1 ring-line">✕</span>
              <span className="text-[11px] font-semibold text-muted">{tx("Closed — no response")}</span>
            </div>
          </li>
        </ol>
        {cadErr && <p role="alert" className="text-[13px] text-danger">{cadErr}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sky-light/60 px-4 py-3">
          <p className="text-[13px] text-body">{tx("Calls on day {days}. If nobody answers the last call, the lead closes.", { days: cad.filter(Boolean).join(", ") })}</p>
          <span className="flex items-center gap-2">
            {cadDirty && <button type="button" className="text-[13px] text-muted hover:underline" onClick={() => { setCad(S.call_cadence.map(String)); setCadErr(""); }}>{tx("Undo")}</button>}
            <button className="btn btn-sm h-10 bg-sky text-white disabled:opacity-50" disabled={!cadDirty} onClick={saveCadence}>{cadDirty ? tx("Save plan") : tx("Saved ✓")}</button>
          </span>
        </div>
      </Section>

      <Section title={tx("Upfront payment discounts")} icon={Tag} tone="leaf" sub={tx("Families who pay several months at once get a discount. Staff pick the number of months when recording a payment.")}>
        <div className="flex flex-wrap gap-3">
          {(S.upfront ?? DEFAULT_UPFRONT).map((u, i) => (
            <div key={i} className="flex items-end gap-2 rounded-xl bg-leaf-light/60 p-3">
              <label className="label text-xs">{tx("Months paid")}<input className={`${inp} w-20 text-center`} type="number" min={2} max={12} defaultValue={u.months} onBlur={(e) => { const v = Math.round(Number(e.target.value)); if (v >= 2 && v <= 12 && v !== u.months) { update((d) => { const arr = [...(d.settings.upfront ?? DEFAULT_UPFRONT)]; arr[i] = { ...arr[i], months: v }; d.settings.upfront = arr.sort((x, y) => x.months - y.months); }); toast(tx("Saved")); } }} /></label>
              <label className="label text-xs">{tx("Discount %")}<input className={`${inp} w-20 text-center`} type="number" min={0} max={50} defaultValue={u.pct} onBlur={(e) => { const v = Number(e.target.value); if (v >= 0 && v <= 50 && v !== u.pct) { update((d) => { const arr = [...(d.settings.upfront ?? DEFAULT_UPFRONT)]; arr[i] = { ...arr[i], pct: v }; d.settings.upfront = arr; }); toast(tx("Saved")); } }} /></label>
            </div>
          ))}
        </div>
      </Section>

      <Section title={tx("Centre")} icon={Building2} tone="plum" sub={tx("Used in messages, receipts and reports.")}>
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1.4fr_1fr_0.8fr_0.9fr_1fr]">
          <label className="label text-xs">{tx("Branch name")}<input className={inp} defaultValue={S.branch_name} onBlur={(e) => e.target.value.trim() && e.target.value !== S.branch_name && (update((d) => { d.settings.branch_name = e.target.value.trim(); }), saved())} /></label>
          <label className="label text-xs">{tx("Centre phone")}<input className={inp} defaultValue={S.centre_phone} onBlur={(e) => e.target.value !== S.centre_phone && (update((d) => { d.settings.centre_phone = e.target.value; }), saved())} /></label>
          <label className="label text-xs">{tx("Fees due on day")}<input className={`${inp} text-center`} type="number" min={1} max={28} defaultValue={S.fee_due_day} onBlur={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= 28 && v !== S.fee_due_day) { update((d) => { d.settings.fee_due_day = v; }); saved(); } }} /></label>
          <label className="label text-xs">{tx("Remind days before")}<input className={`${inp} text-center`} type="number" min={0} max={14} defaultValue={S.reminder_days_before} onBlur={(e) => { const v = Number(e.target.value); if (v >= 0 && v <= 14 && v !== S.reminder_days_before) { update((d) => { d.settings.reminder_days_before = v; }); saved(); } }} /></label>
          <label className="label text-xs">{tx("Default language")}<select className={inp} value={S.default_language} onChange={(e) => { update((d) => { d.settings.default_language = e.target.value as "en" | "am"; }); saved(); }}><option value="en">{tx("English")}</option><option value="am">አማርኛ</option></select></label>
        </div>
      </Section>
    </div>
  );
}
