import { tx } from "@/lib/tr";
import { createContext, useContext, useEffect, useState } from "react";
import { Lock, MessageCircle, Phone, Send, Check } from "lucide-react";
import { initials, telHref, tgHref, waHref } from "@/lib/format";
import type { Key, Lang } from "@/lib/i18n";

/* ───────────────────────── App context: routing, language, toasts ───────────────────────── */

export type Page = "dashboard" | "leads" | "lead-form" | "children" | "child-form" | "payment" | "receipt" | "reminders" | "expenses" | "reports" | "report-print" | "settings";
export type Route = { page: Page; params: Record<string, string | undefined> };
type AppCtx = {
  route: Route;
  go: (page: Page, params?: Record<string, string | undefined>) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: Key) => string;
  toast: (msg: string) => void;
};
export const AppContext = createContext<AppCtx | null>(null);
export function useApp() {
  const c = useContext(AppContext);
  if (!c) throw new Error("AppContext missing");
  return c;
}

/* ───────────────────────── Colour tones ───────────────────────── */

export type Tone = "brand" | "sky" | "leaf" | "amber" | "plum" | "rose" | "gold" | "slate";
export const TONE: Record<Tone, { solid: string; soft: string; text: string; ring: string; hex: string }> = {
  brand: { solid: "bg-brand text-white", soft: "bg-brand-light", text: "text-brand-dark", ring: "border-brand", hex: "#1f6e7f" },
  sky: { solid: "bg-sky text-white", soft: "bg-sky-light", text: "text-sky", ring: "border-sky", hex: "#2f7fa6" },
  leaf: { solid: "bg-leaf text-white", soft: "bg-leaf-light", text: "text-leaf-dark", ring: "border-leaf", hex: "#35633f" },
  amber: { solid: "bg-amber text-white", soft: "bg-amber-light", text: "text-warn-dark", ring: "border-amber", hex: "#b8651f" },
  plum: { solid: "bg-plum text-white", soft: "bg-plum-light", text: "text-plum-dark", ring: "border-plum", hex: "#6b55a0" },
  rose: { solid: "bg-rose text-white", soft: "bg-danger-light", text: "text-danger", ring: "border-rose", hex: "#b04040" },
  gold: { solid: "bg-gold text-white", soft: "bg-gold-light", text: "text-[#7a5a12]", ring: "border-gold", hex: "#c99a2e" },
  slate: { solid: "bg-body text-white", soft: "bg-canvas", text: "text-body", ring: "border-body", hex: "#33474b" },
};

/* ───────────────────────── Building blocks ───────────────────────── */

export function PageHeader({ title, subtitle, eyebrow, icon: Icon, tone = "brand", badge, actions }: {
  title: string; subtitle?: React.ReactNode; eyebrow?: React.ReactNode; icon?: React.ComponentType<{ size?: number }>; tone?: Tone; badge?: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon && <span className={`hidden h-12 w-12 flex-none items-center justify-center rounded-2xl sm:flex ${TONE[tone].solid}`}><Icon size={22} /></span>}
        <div className="min-w-0">
          {eyebrow && <p className="mb-0.5 text-sm text-muted">{eyebrow}</p>}
          <h1 className="flex flex-wrap items-center gap-2.5 text-[26px] font-bold leading-tight md:text-[28px]">{title}{badge}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PartnersBadge({ label }: { label: string }) {
  return <span className="pill bg-ink text-white"><Lock size={11} aria-hidden /> {label}</span>;
}

const AVATAR_TONES = ["bg-brand-light text-brand-dark", "bg-leaf-light text-leaf-dark", "bg-sky-light text-sky", "bg-plum-light text-plum-dark", "bg-amber-light text-warn-dark", "bg-gold-light text-[#7a5a12]"];
export function Avatar({ name, active = false, size = 40 }: { name: string; active?: boolean; size?: number }) {
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length;
  return (
    <span aria-hidden style={{ width: size, height: size }} className={`flex flex-none items-center justify-center rounded-full text-[13px] font-bold ${active ? "bg-brand text-white" : AVATAR_TONES[idx]}`}>
      {initials(name) || "?"}
    </span>
  );
}

export const PAY_TONE: Record<string, string> = {
  paid: "bg-leaf-light text-leaf-dark", partial: "bg-amber-light text-warn-dark", unpaid: "bg-danger-light text-danger", none: "bg-canvas text-body",
};
export function PayPill({ status, label }: { status: string; label: string }) {
  return <span className={`pill ${PAY_TONE[status] ?? PAY_TONE.none}`}>{label}</span>;
}

export function Tabs<T extends string>({ items, value, onChange }: { items: { key: T; label: string; count?: number; tone?: Tone }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap" role="tablist">
      {items.map((it) => {
        const on = it.key === value;
        const tone = TONE[it.tone ?? "slate"];
        return (
          <button key={it.key} role="tab" aria-selected={on} onClick={() => onChange(it.key)}
            className={`chip ${on ? `${it.tone ? tone.solid : "bg-ink text-white"} border-transparent font-semibold` : ""}`}>
            {it.tone && !on && <span className="h-2 w-2 rounded-full" style={{ background: tone.hex }} aria-hidden />}
            {tx(it.label)}
            {it.count !== undefined && <span className={`rounded-full px-1.5 text-xs ${on ? "bg-white/25 text-white" : "bg-canvas text-muted"}`}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Bar({ pct, color, h = 8 }: { pct: number; color: string; h?: number }) {
  return (
    <div className="overflow-hidden rounded-full bg-line-soft" style={{ height: h }}>
      <div className="rounded-full transition-all" style={{ height: h, width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted">{children}</p>;
}

export function Notice({ tone = "brand", children }: { tone?: Tone; children: React.ReactNode }) {
  return <div className={`rounded-xl px-4 py-3 text-sm ${TONE[tone].soft} ${TONE[tone].text}`} role="status">{children}</div>;
}

export function ContactButtons({ phone, telegram = "", message = "", dark = false, compact = false, stacked = false }: { phone: string; telegram?: string; message?: string; dark?: boolean; compact?: boolean; stacked?: boolean }) {
  const { toast } = useApp();
  const [showNum, setShowNum] = useState(false);
  const tel = telHref(phone), wa = waHref(phone, message), tg = tgHref(telegram, phone);
  const base = dark ? "border border-white/40 bg-white/10 text-white hover:bg-white/20" : "border border-field bg-white text-ink hover:border-brand";
  const cls = `flex items-center gap-1.5 rounded-[10px] text-[13px] font-semibold ${stacked ? "h-11 justify-start gap-3 px-3.5" : "justify-center"} ${!stacked && (compact ? "h-9" : "h-11")} ${base}`;
  const icon = stacked ? "flex-none" : "hidden flex-none @[300px]:block";
  return (
    <div className="@container relative">
      <div className={`grid gap-2 ${stacked ? "grid-cols-1" : "grid-cols-3"}`}>
        <button type="button" aria-expanded={showNum} onClick={() => setShowNum((v) => !v)} className={cls}><Phone size={15} className={`${icon} ${dark ? "" : "text-brand"}`} aria-hidden /> {tx("Call")}</button>
        <a href={wa || undefined} target="_blank" rel="noopener" className={cls}><MessageCircle size={15} className={`${icon} ${dark ? "" : "text-leaf"}`} aria-hidden /> {tx("WhatsApp")}</a>
        <a href={tg || undefined} target="_blank" rel="noopener" className={cls}
          onClick={() => { if (message) navigator.clipboard?.writeText(message).then(() => toast(tx("Message copied — paste it in Telegram")), () => {}); }}>
          <Send size={15} className={`${icon} ${dark ? "" : "text-sky"}`} aria-hidden /> {tx("Telegram")}
        </a>
      </div>
      {showNum && (
        <div role="dialog" aria-label={tx("Phone number")} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-3 text-ink shadow-lg">
          <span className="flex flex-col"><span className="text-xs text-muted">{tx("Call this number")}</span><strong className="text-xl tracking-wide tabular-nums">{phone || tx("No number saved")}</strong></span>
          <span className="flex gap-1.5">
            {phone && <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(phone).then(() => toast(tx("Number copied")), () => {})}>{tx("Copy")}</button>}
            {tel && <a href={tel} className="btn btn-primary btn-sm md:hidden">{tx("Call now")}</a>}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNum(false)} aria-label={tx("Close")}>✕</button>
          </span>
        </div>
      )}
    </div>
  );
}

/** Two-step confirm (browser confirm() is blocked in previews). */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = "text-[13px] text-danger hover:underline", question }: { label: React.ReactNode; confirmLabel?: string; onConfirm: () => void; className?: string; question?: string }) {
  const [ask, setAsk] = useState(false);
  confirmLabel = confirmLabel ?? tx("Yes, do it");
  if (!ask) return <button type="button" className={className} onClick={() => setAsk(true)}>{label}</button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[13px]">
      {question && <span className="text-body">{question}</span>}
      <button type="button" className="btn btn-sm bg-rose text-white" onClick={() => { setAsk(false); onConfirm(); }}>{confirmLabel}</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAsk(false)}>{tx("Cancel")}</button>
    </span>
  );
}

export function Toasts({ items }: { items: { id: number; msg: string }[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 lg:inset-x-auto lg:bottom-6 lg:right-6 lg:items-end" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg"><Check size={16} className="text-[#8fd6a0]" /> {t.msg}</div>
      ))}
    </div>
  );
}

export function useAutoClear<T>(value: T | null, ms = 2500, clear: () => void) {
  useEffect(() => {
    if (value == null) return;
    const id = setTimeout(clear, ms);
    return () => clearTimeout(id);
  }, [value, ms, clear]);
}
