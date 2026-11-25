import { tx } from "@/lib/tr";
import { useState } from "react";
import { PhoneCall } from "lucide-react";
import { useStore } from "../store";
import { PageHeader, useApp } from "../ui";
import { SOURCES } from "@/lib/labels";
import type { Lead } from "@/lib/types";

export default function LeadForm() {
  const { db, update, newId } = useStore();
  const { go, route, toast, t } = useApp();
  const existing = db.leads.find((l) => l.id === route.params.id);
  const [f, setF] = useState({
    parent_name: existing?.parent_name ?? "", relationship: existing?.relationship ?? "", phone: existing?.phone ?? "", telegram: existing?.telegram ?? "",
    preferred_channel: existing?.preferred_channel ?? "call", has_whatsapp: existing?.has_whatsapp ?? false, child_name: existing?.child_name ?? "",
    child_age: existing?.child_age ?? "", source: existing?.source ?? "", area: existing?.area ?? "",
    concern: existing?.concern ?? "", notes: existing?.notes ?? "",
  });
  const [ids, setIds] = useState<string[]>(existing?.service_ids?.length ? existing.service_ids : existing?.service_id ? [existing.service_id] : []);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.parent_name.trim()) return setError(tx("Parent name is required"));
    if (f.phone.replace(/\D/g, "").length < 9) return setError(tx("Enter a full phone number"));
    if (!f.source) return setError(tx("Choose how they heard about us"));
    const data = { ...f, parent_name: f.parent_name.trim(), telegram: f.telegram.replace(/^@/, ""), service_ids: ids, service_id: ids[0] ?? null } as Partial<Lead>;
    if (existing) {
      update((d) => Object.assign(d.leads.find((l) => l.id === existing.id)!, data));
      toast(tx("Enquiry updated")); go("leads", { open: existing.id });
    } else {
      const id = newId();
      update((d) => {
        const code = `L-${String(++d.seq.lead).padStart(3, "0")}`;
        d.leads.push({ ...(data as Lead), id, code, status: "open", close_reason: null, call_attempts: 0, next_call_at: new Date().toISOString(), assessment_at: null, child_id: null, created_at: new Date().toISOString() });
      }, ["New enquiry · {name}", { name: data.parent_name ?? "" }]);
      toast(tx("Enquiry saved — first call is due now")); go("leads", { tab: "logged", open: id });
    }
  }
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader icon={PhoneCall} tone="sky" title={existing ? tx("Edit {name}", { name: existing.code }) : t("leads.new")} subtitle={existing ? existing.parent_name : tx("The first call is due within an hour of saving.")} />
      <form onSubmit={save} className="card flex flex-col gap-5 p-5 md:p-7" noValidate>
        {error && <p role="alert" className="rounded-xl bg-danger-light px-4 py-3 text-sm text-danger">{error}</p>}
        <fieldset className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <legend className="eyebrow mb-3 text-sky">{tx("Parent")}</legend>
          <label className="label">{tx("Parent name *")}<input className="input" value={f.parent_name} onChange={set("parent_name")} /></label>
          <label className="label">{tx("Relationship")}<input className="input" value={f.relationship} onChange={set("relationship")} placeholder={tx("Mother, father, guardian…")} /></label>
          <label className="label">{tx("Phone *")}<input className="input" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="09…" /></label>
          <label className="label">{tx("Telegram username")}<input className="input" value={f.telegram} onChange={set("telegram")} placeholder={tx("@username (optional)")} /></label>
          <label className="label">{tx("Prefers")}
            <select className="input" value={f.preferred_channel} onChange={set("preferred_channel")}><option value="call">{tx("Phone call")}</option><option value="whatsapp">{tx("WhatsApp")}</option><option value="telegram">{tx("Telegram")}</option></select>
          </label>
          <label className="flex min-h-11 items-center gap-3 self-end text-sm"><input type="checkbox" checked={f.has_whatsapp} onChange={(e) => setF({ ...f, has_whatsapp: e.target.checked })} className="h-5 w-5 accent-[#1f6e7f]" /> {tx("Has WhatsApp on this number")}</label>
        </fieldset>
        <fieldset className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <legend className="eyebrow mb-3 text-leaf">{tx("Child & enquiry")}</legend>
          <label className="label">{tx("Child's name")}<input className="input" value={f.child_name} onChange={set("child_name")} /></label>
          <label className="label">{tx("Child's age")}<input className="input" value={f.child_age} onChange={set("child_age")} placeholder="e.g. 4" /></label>
          <div className="flex flex-col gap-2 md:col-span-2">
            <span className="text-[13px] font-medium text-body">{tx("Interested in")} <span className="font-normal text-muted">{tx("— tick all that apply, or leave empty if they're not sure yet")}</span></span>
            <div className="flex flex-wrap gap-2" role="group" aria-label={tx("Interested in")}>
              {db.services.filter((s) => s.active).map((s) => { const on = ids.includes(s.id); return (
                <button key={s.id} type="button" aria-pressed={on} onClick={() => setIds(on ? ids.filter((x) => x !== s.id) : [...ids, s.id])}
                  className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[13px] transition ${on ? "border-sky bg-sky font-semibold text-white shadow-sm" : "border-field bg-white hover:border-sky"}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${on ? "border-white bg-white text-sky" : "border-field"}`}>{on ? "✓" : ""}</span>{s.name}
                </button>
              ); })}
            </div>
          </div>
          <label className="label">{tx("How did they hear about us? *")}
            <select className="input" value={f.source} onChange={set("source")}><option value="" disabled>{tx("Choose…")}</option>{Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="label">{tx("Area / neighbourhood")}<input className="input" value={f.area} onChange={set("area")} placeholder={tx("e.g. Bethel, Ayat, Adama")} /></label>
          <label className="label">{tx("Main concern")}<input className="input" value={f.concern} onChange={set("concern")} placeholder={tx("e.g. not speaking yet")} /></label>
          <label className="label md:col-span-2">{tx("Notes")}<textarea className="input" rows={3} value={f.notes} onChange={set("notes")} /></label>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => go("leads", existing ? { open: existing.id } : {})}>{tx("Cancel")}</button>
          <button className="btn btn-primary">{existing ? tx("Save changes") : tx("Save enquiry")}</button>
        </div>
      </form>
    </div>
  );
}
