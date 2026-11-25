import type { Lang } from "./i18n";
import { AM } from "./am";

/** English text is the key. Amharic comes from AM; anything missing falls back to English and is recorded. */
let current: Lang = "en";
export const setTxLang = (l: Lang) => { current = l; };
export const txLang = () => current;
const missing = new Set<string>();
declare global { interface Window { __txMissing?: string[] } }

let VALUES: Set<string> | null = null;
export function tx(s: string, vars?: Record<string, string | number>): string {
  let out = s;
  if (current === "am" && s && /[A-Za-z]/.test(s)) {
    VALUES ??= new Set(Object.values(AM));
    const hit = AM[s];
    if (hit == null && VALUES.has(s)) return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "") + "") : s;
    if (hit == null) { if (!missing.has(s)) { missing.add(s); if (typeof window !== "undefined") window.__txMissing = [...missing]; } }
    else out = hit;
  }
  return vars ? out.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "") + "") : out;
}
/** Plural helper: tx with {n}; picks "one" or "other" English key. Amharic does not inflect the same way, so one entry is enough. */
export function txn(n: number, one: string, other: string, vars: Record<string, string | number> = {}) {
  return tx(n === 1 ? one : other, { n, ...vars });
}

/** For data that may be a known default (e.g. the starting service names): translate if we know it, never flag it. */
export function txd(s: string): string {
  return current === "am" && AM[s] != null ? AM[s] : s;
}

/** Label maps translate on read, so LABEL[k] and Object.entries(LABEL) follow the current language. */
export const txMap = <R extends Record<string, string>>(o: R): R =>
  new Proxy(o, { get: (t, k) => (typeof k === "string" && typeof t[k] === "string" ? tx(t[k] as string) : Reflect.get(t, k)) });
/** Marks text for translation where it is stored first and translated when shown (tx at the display site). */
export const tl = (s: string) => s;
/** Run fn as if the language were l — used to build parent messages in a language different from the screen. */
export function withLang<T>(l: Lang, fn: () => T): T {
  const prev = current; current = l;
  try { return fn(); } finally { current = prev; }
}
/** Same English word, different meaning (e.g. "Call" as a button vs. as a label): looks up "context|text" first. */
export function txc(context: string, s: string, vars?: Record<string, string | number>): string {
  if (current === "am" && AM[`${context}|${s}`] != null) return tx(AM[`${context}|${s}`], vars);
  return tx(s, vars);
}
