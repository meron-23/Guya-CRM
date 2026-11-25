import { setTxLang, tx } from "@/lib/tr";
import { useCallback, useMemo, useState } from "react";
import { Eye, EyeOff, Bell, FileDown, LayoutGrid, Lock, LogOut, MoreHorizontal, PhoneCall, Plus, SlidersHorizontal, Users, Wallet, X } from "lucide-react";
import { makeT, type Key, type Lang } from "@/lib/i18n";
import { useStore } from "./store";
import { bucketOf, useBilling } from "./helpers";
import { AppContext, Avatar, Toasts, TONE, type Page, type Route, type Tone } from "./ui";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import LeadForm from "./pages/LeadForm";
import Children from "./pages/Children";
import ChildForm from "./pages/ChildForm";
import PaymentForm from "./pages/PaymentForm";
import Receipt from "./pages/Receipt";
import Reminders from "./pages/Reminders";
import Expenses from "./pages/Expenses";
import Reports from "./pages/Reports";
import ReportPrint from "./pages/ReportPrint";
import Settings from "./pages/Settings";

const NAV: { page: Page; label: Key; icon: typeof LayoutGrid; tone: Tone; partner?: boolean }[] = [
  { page: "dashboard", label: "nav.dashboard", icon: LayoutGrid, tone: "brand" },
  { page: "leads", label: "nav.leads", icon: PhoneCall, tone: "sky" },
  { page: "children", label: "nav.children", icon: Users, tone: "leaf" },
  { page: "reminders", label: "nav.reminders", icon: Bell, tone: "amber" },
  { page: "expenses", label: "nav.expenses", icon: Wallet, tone: "plum", partner: true },
  { page: "reports", label: "nav.reports", icon: FileDown, tone: "gold" },
  { page: "settings", label: "nav.settings", icon: SlidersHorizontal, tone: "slate", partner: true },
];
const SECTION: Partial<Record<Page, Page>> = { "lead-form": "leads", "child-form": "children", payment: "children", receipt: "children", "report-print": "reports" };
const PARTNER_PAGES: Page[] = ["expenses", "settings"];

function Login({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const { signIn, error: backendError } = useStore();
  const [u, setU] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!u.trim() || !pw) return setErr(tx("Enter your username and password"));
    setBusy(true);
    const r = await signIn(u, pw);
    if (r === "wrong") setErr(tx("Username or password is not correct"));
    else if (r === "off") setErr(tx("This login has been turned off. Ask a partner."));
    else if (r === "error") setErr(backendError || tx("Could not connect to the platform. Try again."));
    setBusy(false);
  };
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-deep p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand/40" /><div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-leaf/30" />
        <span className="relative inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm"><span className="h-2 w-2 rounded-full bg-[#7fd49a]" /> {tx("Bethel Branch")}</span>
        <div className="relative">
          <h2 className="text-4xl font-extrabold leading-tight">{tx("Every family,")}<br />{tx("every call,")}<br />{tx("every payment —")}<br /><span className="text-[#f2c75c]">{tx("in one place.")}</span></h2>
          <p className="mt-4 max-w-sm text-white/75">{tx(
            "Guya Special Need Therapy Center's own platform for enquiries, children, payments and reminders."
          )}</p>
        </div>
        <p className="relative text-xs text-white/50">{tx("© Guya Special Need Therapy Center")}</p>
      </section>
      <section className="flex items-center justify-center bg-canvas p-5">
        <div className="w-full max-w-[400px]">
          <div className="mb-4 flex justify-end"><div className="grid grid-cols-2 gap-1 rounded-[10px] bg-white p-1 shadow-sm">{(["en", "am"] as const).map((l) => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`h-8 rounded-lg px-3 text-[13px] ${lang === l ? "bg-brand font-semibold text-white" : "text-body"}`}>{l === "en" ? "English" : "አማርኛ"}</button>)}</div></div>
          <img src="./logo.png" alt={tx("Guya Special Need Therapy Center")} className="mx-auto mb-6 w-[180px]" />
          <form onSubmit={submit} className="card flex flex-col gap-4 p-7" noValidate>
            <div><h1 className="text-xl font-bold">{tx("Sign in")}</h1><p className="text-sm text-muted">{tx("Use the login a partner gave you.")}</p></div>
            {backendError && <p role="alert" className="rounded-xl bg-danger-light px-3.5 py-2.5 text-sm text-danger">{backendError}</p>}
            {err && <p role="alert" className="rounded-xl bg-danger-light px-3.5 py-2.5 text-sm text-danger">{err}</p>}
            <label className="label">{tx("Username")}<input className="input" autoComplete="username" autoCapitalize="none" value={u} onChange={(e) => { setU(e.target.value); setErr(""); }} placeholder={tx("e.g. mekdes")} /></label>
            <label className="label">{tx("Password")}
              <span className="relative">
                <input className="input pr-12" type={show ? "text" : "password"} autoComplete="current-password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }} />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? tx("Hide password") : tx("Show password")} className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-canvas">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </span>
            </label>
            <button disabled={busy} className="btn btn-primary h-12 text-base">{busy ? tx("Signing in…") : tx("Sign in")}</button>
            <p className="text-center text-xs text-muted">{tx("Forgot your password? Ask Amman or Sara for a new login.")}</p>
          </form>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const { db, me, isPartner, userId, setUserId, loading, error } = useStore();
  const [route, setRoute] = useState<Route>({ page: "dashboard", params: {} });
  const [lang, setLangRaw] = useState<Lang>(() => { try { return (localStorage.getItem("guya-lang") as Lang) || db.settings.default_language || "en"; } catch { return "en"; } });
  const setLangState = (l: Lang) => { setLangRaw(l); try { localStorage.setItem("guya-lang", l); } catch { /* ignore */ } };
  setTxLang(lang);
  if (typeof document !== "undefined") document.documentElement.lang = lang === "am" ? "am" : "en";
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [more, setMore] = useState(false);

  const go = useCallback((page: Page, params: Record<string, string | undefined> = {}) => {
    setRoute({ page, params });
    setMore(false);
    window.scrollTo({ top: 0 });
  }, []);
  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-1), { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);
  const t = useMemo(() => makeT(lang), [lang]);
  const ctx = useMemo(() => ({ route, go, lang, setLang: setLangState, t, toast }), [route, go, lang, t, toast]);

  const { rows: billRows } = useBilling();
  const badges: Partial<Record<Page, { n: number; tone: string; title: string }>> = useMemo(() => {
    const due = db.leads.filter((l) => { const b = bucketOf(l); return b === "today" || b === "overdue"; }).length;
    const late = billRows.filter((r) => r.b.owes > 0 && r.b.late).length;
    return { leads: { n: due, tone: "bg-sky", title: tx("Calls due today") }, reminders: { n: late, tone: "bg-amber", title: tx("Payments overdue") } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, billRows, lang]);
  const Badge = ({ page, light }: { page: Page; light?: boolean }) => { const b = badges[page]; return b && b.n > 0 ? <span title={b.title} aria-hidden className={`min-w-[22px] rounded-full px-1.5 text-center text-[11px] font-bold leading-[20px] text-white ${b.tone} ${light ? "ring-2 ring-white" : ""}`}>{b.n}</span> : null; };
  if (loading) return <main className="flex min-h-dvh items-center justify-center bg-canvas text-sm text-muted">{tx("Loading your workspace…")}</main>;
  if (!userId || !db.profiles.some((p) => p.id === userId && p.active)) return <Login lang={lang} setLang={setLangState} />;

  const denied = PARTNER_PAGES.includes(route.page) && !isPartner;
  const section = SECTION[route.page] ?? route.page;
  const logout = () => { setUserId(""); setRoute({ page: "dashboard", params: {} }); };

  const langSwitch = (dark: boolean) => (
    <div className={`grid grid-cols-2 gap-1 rounded-[10px] p-1 ${dark ? "bg-white/10" : "bg-canvas"}`}>
      {(["en", "am"] as const).map((l) => (
        <button key={l} aria-pressed={lang === l} onClick={() => setLangState(l)}
          className={`h-9 rounded-lg text-[13px] ${lang === l ? "bg-white font-semibold text-ink shadow-sm" : dark ? "text-white/80" : "text-body"}`}>
          {l === "en" ? tx("English") : "አማርኛ"}
        </button>
      ))}
    </div>
  );

  let content: React.ReactNode;
  if (denied) {
    content = (
      <div className="card mx-auto mt-16 flex max-w-md flex-col items-center gap-3 p-9 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-plum-light text-plum"><Lock size={28} /></span>
        <h1 className="text-xl font-bold">{tx("Not available")}</h1>
        <p className="text-sm text-muted">{tx("This page isn't part of your account.")}</p>
        <button className="btn btn-primary" onClick={() => go("dashboard")}>{tx("Back to dashboard")}</button>
      </div>
    );
  } else {
    const k = JSON.stringify(route.params);
    switch (route.page) {
      case "dashboard": content = <Dashboard />; break;
      case "leads": content = <Leads />; break;
      case "lead-form": content = <LeadForm key={k} />; break;
      case "children": content = <Children />; break;
      case "child-form": content = <ChildForm key={k} />; break;
      case "payment": content = <PaymentForm key={k} />; break;
      case "receipt": content = <Receipt />; break;
      case "reminders": content = <Reminders />; break;
      case "expenses": content = <Expenses />; break;
      case "reports": content = <Reports />; break;
      case "report-print": content = <ReportPrint />; break;
      case "settings": content = <Settings />; break;
    }
  }

  const mobileMain = NAV.filter((n) => ["dashboard", "leads", "children", "reminders"].includes(n.page));
  const mobileMore = NAV.filter((n) => !["dashboard", "leads", "children", "reminders"].includes(n.page) && (isPartner || !n.partner));

  return (
    <AppContext.Provider value={ctx}>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-[256px] flex-none flex-col gap-1 overflow-y-auto bg-brand-deep px-4 py-5 text-white lg:flex">
          <button onClick={() => go("dashboard")} className="rounded-2xl bg-white px-4 py-3"><img src="./logo.png" alt={tx("Guya Special Need Therapy Center")} className="w-[150px]" /></button>
          <span className="mb-4 mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#bfe7c8]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#8fd6a0]" aria-hidden />{db.settings.branch_name}
          </span>
          {NAV.filter((n) => isPartner || !n.partner).map((n) => {
            const locked = false;
            const active = section === n.page;
            return (
              <button key={n.page} disabled={locked} onClick={() => go(n.page)} aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition ${active ? "bg-white font-semibold text-ink shadow" : locked ? "text-white/45" : "text-white/85 hover:bg-white/10"}`}>
                <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg ${active ? TONE[n.tone].solid : "bg-white/10"}`}><n.icon size={17} aria-hidden /></span>
                <span className="flex-1">{t(n.label)}</span>
                <Badge page={n.page} />
              </button>
            );
          })}
          <div className="mt-auto flex flex-col gap-3 border-t border-white/15 pt-4">
            <div className="flex items-center gap-2.5">
              <Avatar name={me.full_name} size={36} />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{me.full_name}</div><div className="text-xs text-white/65">{isPartner ? tx("Partner") : tx("Staff")}</div></div>
              <button onClick={logout} className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/10" aria-label={tx("Sign out")} title={tx("Sign out")}><LogOut size={17} /></button>
            </div>
            {langSwitch(true)}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between bg-brand-deep px-4 py-2.5 lg:hidden">
            <button onClick={() => go("dashboard")} className="rounded-xl bg-white px-2.5 py-1.5"><img src="./logo.png" alt={tx("Guya")} className="w-[78px]" /></button>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#bfe7c8]">{db.settings.branch_name}</span>
          </header>
          <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-28 pt-5 md:px-8 md:pt-8 lg:pb-12">{content}</main>

          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white shadow-[0_-4px_12px_rgba(23,41,45,0.06)] lg:hidden" aria-label={tx("Main")}>
            {mobileMain.map((n) => {
              const active = section === n.page;
              return (
                <button key={n.page} onClick={() => go(n.page)} className={`flex h-[60px] flex-col items-center justify-center gap-1 text-[11px] ${active ? `font-bold ${TONE[n.tone].text}` : "text-muted"}`}>
                  <span className={`relative flex h-7 w-10 items-center justify-center rounded-full ${active ? TONE[n.tone].soft : ""}`}><n.icon size={19} aria-hidden /><span className="absolute -right-2 -top-1.5"><Badge page={n.page} light /></span></span>
                  {t(n.label)}
                </button>
              );
            })}
            <button onClick={() => setMore(true)} className="flex h-[60px] flex-col items-center justify-center gap-1 text-[11px] text-muted"><span className="flex h-7 items-center"><MoreHorizontal size={20} aria-hidden /></span>{t("nav.more")}</button>
          </nav>

          {more && (
            <div className="fixed inset-0 z-40 flex items-end bg-ink/45 lg:hidden" onClick={() => setMore(false)}>
              <div className="w-full rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center gap-3">
                  <Avatar name={me.full_name} />
                  <div className="flex-1"><div className="font-semibold">{me.full_name}</div><div className="text-xs text-muted">{isPartner ? tx("Partner") : tx("Staff")}</div></div>
                  <button onClick={() => setMore(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-canvas" aria-label={tx("Close")}><X size={18} /></button>
                </div>
                <button onClick={() => go("payment")} className="btn btn-primary mb-2 w-full"><Plus size={16} /> {t("pay.record")}</button>
                {mobileMore.map((n) => {
                  const locked = n.partner && !isPartner;
                  return (
                    <button key={n.page} disabled={locked} onClick={() => go(n.page)} className={`flex w-full items-center gap-3 border-b border-line-soft py-3 text-left ${locked ? "text-faint" : ""}`}>
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${locked ? "bg-canvas" : TONE[n.tone].solid}`}><n.icon size={18} /></span>
                      <span className="flex-1">{t(n.label)}</span>{locked && <Lock size={14} />}
                    </button>
                  );
                })}
                <div className="mt-4 flex flex-col gap-2.5">
                  {langSwitch(false)}
                  <button onClick={logout} className="btn btn-secondary w-full"><LogOut size={16} /> {tx("Sign out")}</button>
                </div>
              </div>
            </div>
          )}
        </div>
        {error && <div role="alert" className="fixed right-4 top-4 z-50 max-w-lg rounded-xl border border-danger/30 bg-danger-light px-4 py-3 text-sm text-danger shadow-lg">{error}</div>}
        <Toasts items={toasts} />
      </div>
    </AppContext.Provider>
  );
}
