import type ExcelJS from "exceljs";
import type { DB } from "./store";
import { buildReport, monthlyMoney, type Dataset } from "./report";
import { calendar, fmtDate, fmtMonth, money, monthStart, todayISO } from "@/lib/format";
import { tx, txd, txLang } from "@/lib/tr";

/* Guya brand colours (ARGB) */
const B = {
  teal: "FF1F6E7F", deep: "FF154A55", tint: "FFF2F8F9", light: "FFE1F1F4", gold: "FFC99A2E", goldLight: "FFFBF3DC",
  leaf: "FF35633F", leafLight: "FFE5F1E7", sky: "FF2B78A8", skyLight: "FFE3EFF7", plum: "FF6B55A0", plumLight: "FFEFE9F7",
  amber: "FFB8651F", rose: "FFB04040", ink: "FF17292D", muted: "FF6B7A7D", line: "FFDCE4E5", white: "FFFFFFFF",
};
const TAB: Record<string, string> = { summary: B.teal, leads: B.sky, calls: B.sky, registrations: B.leaf, payments: B.teal, expenses: B.plum, reminders: B.amber };
const font = () => (txLang() === "am" ? "Ebrima" : "Calibri");
const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = (argb = B.line): Partial<ExcelJS.Border> => ({ style: "thin", color: { argb } });
const isISO = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function buildWorkbook(opts: {
  ExcelJS: typeof import("exceljs"); db: DB; from: string; to: string; label: string; include: Dataset[]; preparedBy: string; logo?: ArrayBuffer | Uint8Array; partner?: boolean;
}) {
  const partner = opts.partner ?? true;
  const { db, from, to, label, include, preparedBy, logo } = opts;
  const { tables, summary } = buildReport(db, from, to, include);
  const wb = new opts.ExcelJS.Workbook();
  wb.creator = "Guya platform"; wb.created = new Date();
  const logoId = logo ? wb.addImage({ buffer: (logo instanceof Uint8Array ? logo : new Uint8Array(logo)) as unknown as ExcelJS.Buffer, extension: "png" }) : null;
  const branch = txd(db.settings.branch_name);

  /* ── Summary ── */
  const ws = wb.addWorksheet(tx("Summary"), { properties: { tabColor: { argb: TAB.summary } }, views: [{ showGridLines: false }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } } });
  ws.columns = [{ width: 3 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 3 }];
  for (let r = 1; r <= 5; r++) ws.getRow(r).height = r === 1 ? 10 : 20;
  if (logoId != null) ws.addImage(logoId, { tl: { col: 1, row: 1 }, ext: { width: 150, height: 62 } });
  ws.mergeCells("D2:G2"); ws.mergeCells("D3:G3"); ws.mergeCells("D4:G4");
  Object.assign(ws.getCell("D2"), { value: tx("Centre report") }); ws.getCell("D2").font = { name: font(), size: 20, bold: true, color: { argb: B.teal } };
  ws.getCell("D3").value = `${branch} · ${label}`; ws.getCell("D3").font = { name: font(), size: 12, color: { argb: B.ink } };
  ws.getCell("D4").value = tx("Prepared by {name} · {date}", { name: preparedBy, date: fmtDate(todayISO(), { year: true }) }); ws.getCell("D4").font = { name: font(), size: 10, color: { argb: B.muted } };
  ["D2", "D3", "D4"].forEach((c) => (ws.getCell(c).alignment = { horizontal: "right", vertical: "middle" }));
  ws.getRow(6).height = 6;
  for (let c = 2; c <= 7; c++) ws.getRow(6).getCell(c).fill = fill(B.gold);

  let row = 8;
  const band = (title: string, color = B.teal) => {
    ws.mergeCells(row, 2, row, 7);
    const c = ws.getCell(row, 2); c.value = title.toUpperCase(); c.font = { name: font(), size: 10, bold: true, color: { argb: B.white } };
    c.fill = fill(color); c.alignment = { vertical: "middle", indent: 1 }; ws.getRow(row).height = 22; row += 1;
  };
  band(tx("Key figures"));
  const kpis: [string, number, string, string, boolean][] = partner ? [
    [tx("Enquiries"), summary.leads, B.skyLight, B.sky, false], [tx("Registered"), summary.registrations, B.leafLight, B.leaf, false], [tx("Payments"), summary.payments, B.light, B.teal, false],
    [tx("Collected (ETB)"), summary.collected, B.leafLight, B.leaf, true], [tx("Expenses (ETB)"), summary.expenses, B.plumLight, B.plum, true], [tx("Profit (ETB)"), summary.profit, B.goldLight, summary.profit < 0 ? B.rose : B.gold, true],
  ] : [
    [tx("Enquiries"), summary.leads, B.skyLight, B.sky, false], [tx("Calls made"), summary.calls, B.skyLight, B.sky, false], [tx("Assessments booked"), summary.assessments, B.leafLight, B.leaf, false],
    [tx("Registered"), summary.registrations, B.leafLight, B.leaf, false], [tx("Payments"), summary.payments, B.light, B.teal, false], [tx("Reminders sent"), summary.reminders, B.goldLight, B.gold, false],
  ];
  const kpiRow = (items: typeof kpis) => {
    const lr = ws.getRow(row), vr = ws.getRow(row + 1); lr.height = 18; vr.height = 30;
    items.forEach(([l, v, bg, fg, isMoney], i) => {
      const col = 2 + i * 2; ws.mergeCells(row, col, row, col + 1); ws.mergeCells(row + 1, col, row + 1, col + 1);
      const a = ws.getCell(row, col), b = ws.getCell(row + 1, col);
      a.value = l; a.font = { name: font(), size: 9, color: { argb: B.muted } }; a.alignment = { indent: 1, vertical: "bottom" };
      b.value = v; b.font = { name: font(), size: 18, bold: true, color: { argb: fg } }; b.alignment = { indent: 1, vertical: "middle", horizontal: "left" };
      if (isMoney) b.numFmt = "#,##0;[Red]-#,##0";
      for (const r of [row, row + 1]) for (const c of [col, col + 1]) { const cell = ws.getCell(r, c); cell.fill = fill(bg); cell.border = { left: c === col ? { style: "medium", color: { argb: fg } } : undefined }; }
    });
    row += 3;
  };
  kpiRow(kpis.slice(0, 3)); kpiRow(kpis.slice(3));
  if (partner && summary.collected > 0) {
    ws.mergeCells(row, 2, row, 7);
    const c = ws.getCell(row, 2); c.value = tx("Each partner's 50% share of profit: {amount}", { amount: money(Math.round(summary.profit / 2)) });
    c.font = { name: font(), size: 10, italic: true, color: { argb: B.muted } }; c.alignment = { indent: 1 }; row += 2;
  }

  const smallTable = (title: string, color: string, head: string[], rows: (string | number)[][], moneyCols: number[], total = true) => {
    band(title, color);
    const h = ws.getRow(row); head.forEach((t, i) => { const c = h.getCell(2 + i); c.value = t; c.font = { name: font(), size: 10, bold: true, color: { argb: B.ink } }; c.fill = fill(B.tint); c.border = { bottom: thin(color) }; c.alignment = { horizontal: i ? "right" : "left", indent: i ? 0 : 1 }; });
    row++;
    rows.forEach((r, ri) => {
      const x = ws.getRow(row); r.forEach((v, i) => { const c = x.getCell(2 + i); c.value = v; c.font = { name: font(), size: 10, color: { argb: typeof v === "number" && v < 0 ? B.rose : B.ink } }; if (moneyCols.includes(i)) c.numFmt = "#,##0;-#,##0"; c.alignment = { horizontal: i ? "right" : "left", indent: i ? 0 : 1 }; c.border = { bottom: thin() }; if (ri % 2) c.fill = fill("FFFAFCFC"); });
      row++;
    });
    if (total && rows.length > 1) {
      const x = ws.getRow(row); x.getCell(2).value = tx("Total"); head.slice(1).forEach((_, j) => { const i = j + 1; const c = x.getCell(2 + i); c.value = rows.reduce((a, r) => a + (Number(r[i]) || 0), 0); if (moneyCols.includes(i)) c.numFmt = "#,##0;-#,##0"; c.alignment = { horizontal: "right" }; });
      for (let i = 0; i < head.length; i++) { const c = x.getCell(2 + i); c.font = { name: font(), size: 10, bold: true, color: { argb: B.ink } }; c.fill = fill(B.goldLight); c.border = { top: { style: "medium", color: { argb: B.gold } } }; if (!i) c.alignment = { indent: 1 }; }
      row++;
    }
    row++;
  };

  const months = monthsBetween(from, to);
  if (partner && months.length >= 2 && months.length <= 24) {
    let mm = monthlyMoney(db, months.length, monthStart(to)).filter((m) => m.m <= monthStart(todayISO()));
    while (mm.length > 1 && !mm[0].rev && !mm[0].exp) mm = mm.slice(1);
    smallTable(tx("Money by month"), B.teal, [tx("Month"), tx("Revenue (ETB)"), tx("Expenses (ETB)"), tx("Profit (ETB)")], mm.map((m) => [fmtMonth(m.m), m.rev, m.exp, m.profit]), [1, 2, 3]);
  }
  if (summary.bySource.length) smallTable(tx("Enquiries by source"), B.sky, [tx("Source"), tx("Enquiries")], summary.bySource, []);
  if (partner && summary.byExpense.length) smallTable(tx("Expenses by group"), B.plum, [tx("Group"), tx("Amount (ETB)")], summary.byExpense, [1]);
  ws.mergeCells(row, 2, row, 7);
  const foot = ws.getCell(row, 2); foot.value = partner ? tx("Guya Special Need Therapy Center · Generated by the Guya platform · Confidential — partners only") : tx("Guya Special Need Therapy Center · Generated by the Guya platform · Staff report");
  foot.font = { name: font(), size: 9, italic: true, color: { argb: B.muted } }; foot.alignment = { horizontal: "center" };
  ws.headerFooter.oddFooter = `&L&8${tx("Guya Special Need Therapy Center")}&R&8${tx("Page {p} of {n}", { p: "&P", n: "&N" })}`;

  /* ── One sheet per dataset ── */
  for (const t of tables) {
    const color = TAB[t.key] ?? B.teal;
    const sh = wb.addWorksheet(t.name.slice(0, 31), { properties: { tabColor: { argb: color } }, views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "4:4" } });
    const n = t.columns.length;
    sh.mergeCells(1, 1, 1, n);
    const title = sh.getCell(1, 1); title.value = `${t.name}  ·  ${label}`; title.font = { name: font(), size: 15, bold: true, color: { argb: B.white } };
    title.fill = fill(color); title.alignment = { vertical: "middle", indent: 1 }; sh.getRow(1).height = 32;
    sh.mergeCells(2, 1, 2, n);
    const sub = sh.getCell(2, 1); sub.value = `${tx("Guya Special Need Therapy Center")} · ${branch} · ${t.rows.length === 1 ? tx("1 row") : tx("{n} rows", { n: t.rows.length })}`;
    sub.font = { name: font(), size: 10, color: { argb: B.muted } }; sub.alignment = { indent: 1, vertical: "middle" }; sh.getRow(2).height = 20;
    for (let c = 1; c <= n; c++) { sh.getRow(2).getCell(c).border = { bottom: { style: "medium", color: { argb: B.gold } } }; }
    sh.getRow(3).height = 6;
    const hr = sh.getRow(4); hr.height = 24;
    t.columns.forEach((h, i) => { const c = hr.getCell(i + 1); c.value = h; c.font = { name: font(), size: 10, bold: true, color: { argb: B.white } }; c.fill = fill(B.deep); c.alignment = { vertical: "middle", horizontal: h.includes("ETB") || h.includes("ብር") || h === tx("Calls") || h === tx("Call no.") ? "right" : "left", indent: 1, wrapText: true }; c.border = { right: thin(B.teal) }; });
    const moneyCols = t.columns.map((h, i) => (h.includes("ETB") || h.includes("(ብር)") ? i : -1)).filter((i) => i >= 0);
    t.rows.forEach((r, ri) => {
      const x = sh.getRow(5 + ri); x.height = 19;
      r.forEach((v, i) => {
        const c = x.getCell(i + 1);
        c.value = isISO(v) ? (calendar() === "eth" ? fmtDate(v as string, { year: true }) : toDate(v as string)) : v === "" ? null : v;
        if (isISO(v) && calendar() !== "eth") c.numFmt = "d mmm yyyy";
        if (moneyCols.includes(i)) c.numFmt = "#,##0";
        c.font = { name: font(), size: 10, color: { argb: t.voided?.[ri] ? B.muted : B.ink }, strike: !!t.voided?.[ri] && moneyCols.includes(i) };
        c.alignment = { vertical: "middle", indent: 1, horizontal: typeof v === "number" ? "right" : "left" };
        c.border = { bottom: thin() };
        if (ri % 2) c.fill = fill(B.tint);
      });
    });
    let last = 4 + t.rows.length;
    if (t.rows.length === 0) {
      sh.mergeCells(5, 1, 5, n); const c = sh.getCell(5, 1); c.value = tx("Nothing in this period."); c.font = { name: font(), size: 10, italic: true, color: { argb: B.muted } }; c.alignment = { indent: 1 }; last = 5;
    } else if (moneyCols.length) {
      const tr = sh.getRow(last + 1); tr.height = 22;
      for (let i = 0; i < n; i++) {
        const c = tr.getCell(i + 1); c.fill = fill(B.goldLight); c.border = { top: { style: "medium", color: { argb: B.gold } } }; c.font = { name: font(), size: 10, bold: true, color: { argb: B.ink } }; c.alignment = { vertical: "middle", indent: 1, horizontal: moneyCols.includes(i) ? "right" : "left" };
        if (i === 0) c.value = tx("Total");
        if (moneyCols.includes(i)) {
          const col = String.fromCharCode(65 + i);
          const excludeVoid = t.key === "payments";
          const sum = t.rows.reduce((a, r, ri) => a + (excludeVoid && t.voided?.[ri] ? 0 : Number(r[i]) || 0), 0);
          c.value = excludeVoid ? sum : { formula: `SUM(${col}5:${col}${last})`, result: sum };
          c.numFmt = "#,##0";
        }
      }
      if (t.key === "payments") { const note = sh.getCell(last + 2, 1); note.value = tx("Voided payments are crossed out and not counted in the total."); note.font = { name: font(), size: 9, italic: true, color: { argb: B.muted } }; }
    }
    if (t.rows.length) sh.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: n } };
    sh.columns.forEach((col, i) => {
      const lens = [t.columns[i].length + 4, ...t.rows.map((r) => (isISO(r[i]) ? 12 : String(r[i] ?? "").length + 3))];
      col.width = Math.min(42, Math.max(10, ...lens));
    });
    sh.headerFooter.oddFooter = `&L&8${tx("Guya")} · ${t.name} · ${label}&R&8${tx("Page {p} of {n}", { p: "&P", n: "&N" })}`;
  }
  return wb;
}

function monthsBetween(from: string, to: string) {
  const out: string[] = []; let m = monthStart(from);
  while (m <= to && out.length < 30) { out.push(m); const [y, mo] = m.split("-").map(Number); m = `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, "0")}-01`; }
  return out;
}

export function reportFileName(label: string, branch: string) {
  return `${tx("Guya {branch} report — {period}", { branch, period: label.replace(/[\\/:*?"<>|]/g, "-") })}.xlsx`;
}

/** Browser: build the workbook and download it. */
export async function downloadExcel(db: DB, from: string, to: string, label: string, include: Dataset[], preparedBy: string, partner = true) {
  const ExcelJS = (await import("exceljs")).default;
  let logo: ArrayBuffer | undefined;
  try { logo = await (await fetch("./logo.png")).arrayBuffer(); } catch { /* logo optional */ }
  const wb = await buildWorkbook({ ExcelJS, db, from, to, label, include: include.filter((k) => partner || k !== "expenses"), preparedBy, logo, partner });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = reportFileName(label, db.settings.branch_name);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
