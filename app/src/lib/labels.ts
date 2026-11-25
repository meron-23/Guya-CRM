import { txMap as T } from "./tr";
export const SOURCES: Record<string, string> = T({
  tiktok: "TikTok", facebook: "Facebook", instagram: "Instagram", referral: "Referral", doctor: "Doctor / clinic",
  walk_in: "Walk-in", phone: "Phone call", other: "Other",
});
export const CHANNELS: Record<string, string> = T({ call: "Phone call", whatsapp: "WhatsApp", telegram: "Telegram" });
export const METHODS: Record<string, string> = T({ telebirr: "Telebirr", cbe: "CBE", cash: "Cash", bank: "Bank transfer", other: "Other" });
export const CLOSE_REASONS: Record<string, string> = T({
  no_response: "No response after all calls", out_of_area: "Out of area", not_interested: "Not interested", price: "Too expensive", other: "Other",
});
export const OUTCOMES: Record<string, string> = T({
  no_answer: "No answer", answered: "Talked", booked_assessment: "Assessment booked", not_interested: "Not interested",
  out_of_area: "Out of area", price: "Too expensive", other: "Closed",
});
export const EXPENSE_CATS = ["rent", "salaries", "utilities", "misc"] as const;
export const EXPENSE_LABEL: Record<string, string> = T({ rent: "Rent", salaries: "Salaries", utilities: "Utilities", misc: "Miscellaneous" });
export const EXPENSE_COLOR: Record<string, string> = { rent: "#1f6e7f", salaries: "#35633f", utilities: "#c9732e", misc: "#6b55a0" };
export const EXPENSE_HINT: Record<string, string> = T({
  rent: "e.g. Building rent", salaries: "Person's name and role, e.g. Hana — ABA therapist", utilities: "e.g. Electricity, Water, Internet", misc: "e.g. Cleaning supplies",
});
export const CATEGORY_LABEL: Record<string, string> = T({ therapy: "Therapy", daycare: "Day care", assessment: "Assessment" });
export const SERVICE_TONE: Record<string, string> = { therapy: "bg-brand-light text-brand-dark", daycare: "bg-plum-light text-plum", assessment: "bg-canvas text-body" };
