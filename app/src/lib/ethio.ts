/** Ethiopian calendar (Amete Mihret) ⇄ Gregorian, via Julian Day Number. */
const EPOCH = 1724221; // JDN of Meskerem 1, year 1

function gToJdn(y: number, m: number, d: number) {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}
function jdnToG(j: number) {
  const a = j + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor((1461 * d) / 4), m = Math.floor((5 * e + 2) / 153);
  return { y: 100 * b + d - 4800 + Math.floor(m / 10), m: m + 3 - 12 * Math.floor(m / 10), d: e - Math.floor((153 * m + 2) / 5) + 1 };
}
export interface Eth { y: number; m: number; d: number }
const ethJdn = (y: number, m: number, d: number) => EPOCH + 365 * (y - 1) + Math.floor(y / 4) + 30 * (m - 1) + d - 1;
export function toEth(iso: string): Eth {
  const [Y, M, D] = iso.slice(0, 10).split("-").map(Number);
  const j = gToJdn(Y, M, D);
  let y = Math.floor((j - EPOCH) / 365.25) + 1;
  while (ethJdn(y + 1, 1, 1) <= j) y++;
  while (ethJdn(y, 1, 1) > j) y--;
  const n = j - ethJdn(y, 1, 1);
  return { y, m: Math.floor(n / 30) + 1, d: (n % 30) + 1 };
}
export function fromEth(y: number, m: number, d: number): string {
  const g = jdnToG(ethJdn(y, m, d));
  return `${g.y}-${String(g.m).padStart(2, "0")}-${String(g.d).padStart(2, "0")}`;
}
export const pagumeDays = (y: number) => (y % 4 === 3 ? 6 : 5);
export const ethDaysInMonth = (y: number, m: number) => (m === 13 ? pagumeDays(y) : 30);

export const ETH_MONTHS_EN = ["Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit", "Megabit", "Miyazya", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume"];
export const ETH_MONTHS_AM = ["መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት", "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ"];
