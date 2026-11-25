import type { Lang } from "@/lib/i18n";

type Vars = Record<string, string>;
const fill = (tpl: string, v: Vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const T = {
  paymentDue: {
    en: "Hello {parent}, a friendly reminder that {child}'s {month} fee of {amount} is due on {due}. Thank you — Guya Special Need Therapy Center, {branch}.",
    am: "ሰላም {parent}፣ የ{child} የ{month} ክፍያ {amount} እስከ {due} ድረስ እንዲከፍሉ በትህትና እናስታውሳለን። እናመሰግናለን — ጉያ ልዩ ፍላጎት ቴራፒ ማዕከል፣ {branch}።",
  },
  paymentLate: {
    en: "Hello {parent}, {child}'s fee of {amount} for {month} has not been paid yet. Please pay as soon as you can, or reply if you need to talk to us. Thank you — Guya, {branch}.",
    am: "ሰላም {parent}፣ የ{child} የ{month} ክፍያ {amount} ገና አልተከፈለም። እባክዎ በተቻለ ፍጥነት ይክፈሉ፤ ማነጋገር ከፈለጉም ይመልሱልን። እናመሰግናለን — ጉያ፣ {branch}።",
  },
  leadFollowUp: {
    en: "Hello {parent}, this is Guya Special Need Therapy Center ({branch}). We tried to call you about your enquiry. When is a good time to talk?",
    am: "ሰላም {parent}፣ ከጉያ ልዩ ፍላጎት ቴራፒ ማዕከል ({branch}) ነው። ስለ ጥያቄዎ ለማነጋገር ደውለን ነበር። ለመነጋገር የሚመችዎ ሰዓት መቼ ነው?",
  },
  assessment: {
    en: "Hello {parent}, a reminder that {child}'s assessment is on {date} at {time} at Guya, {branch}. Please bring any previous medical reports. See you then!",
    am: "ሰላም {parent}፣ የ{child} ግምገማ {date} በ{time} በጉያ፣ {branch} መሆኑን እናስታውሳለን። እባክዎ ቀደም ያሉ የሕክምና ሰነዶችን ይዘው ይምጡ።",
  },
  receipt: {
    en: "Hello {parent}, we received {amount} for {child} ({what}). Receipt no. {code}. Thank you — Guya, {branch}.",
    am: "ሰላም {parent}፣ ለ{child} ({what}) {amount} ተቀብለናል። የደረሰኝ ቁጥር {code}። እናመሰግናለን — ጉያ፣ {branch}።",
  },
};

export type Template = keyof typeof T;
export function message(kind: Template, lang: Lang, v: Vars): string {
  const vars: Vars = { ...v, parent: first(v.parent ?? ""), child: first(v.child ?? "") };
  if (lang === "am") vars.amount = (vars.amount ?? "").replace("ETB", "ብር");
  return fill(T[kind][lang], vars);
}
