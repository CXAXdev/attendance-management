// exceljs の共通処理(動的 import・罫線・見出し・ダウンロード)。
// 各帳票の export モジュールはここだけを使い、ブラウザ用ビルドを初期バンドルに含めない。

import type { Worksheet, Workbook } from "exceljs";

export type ExcelNS = typeof import("exceljs");

export async function loadExcel(): Promise<ExcelNS> {
  const mod = await import("exceljs");
  return (mod as { default?: ExcelNS }).default ?? (mod as unknown as ExcelNS);
}

/** 様式の薄い黄色(見出し) */
export const HEADER_FILL = "FFFFF2CC";

const thin = { style: "thin" as const };
const allBorders = { top: thin, left: thin, bottom: thin, right: thin };

/** 指定範囲の全セルに細罫線を引く */
export function applyBorderRange(
  ws: Worksheet,
  top: number,
  left: number,
  bottom: number,
  right: number
): void {
  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      ws.getCell(r, c).border = allBorders;
    }
  }
}

/** A4 の印刷設定(1ページ幅に収める) */
export function a4(orientation: "portrait" | "landscape") {
  return {
    paperSize: 9,
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  } as const;
}

/** 見出し行を書く(黄色・太字・中央・罫線)。幅も設定する */
export function writeHeaderRow(
  ws: Worksheet,
  row: number,
  columns: [label: string, width: number][]
): void {
  columns.forEach(([label, width], i) => {
    ws.getColumn(i + 1).width = width;
    const c = ws.getCell(row, i + 1);
    c.value = label;
    c.font = { bold: true, size: 10 };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });
  applyBorderRange(ws, row, 1, row, columns.length);
  ws.getRow(row).height = 24;
}

/** 1行分の値を書く(罫線つき)。align は列ごとの寄せ(省略は中央) */
export function writeRow(
  ws: Worksheet,
  row: number,
  values: (string | number | null)[],
  align: ("left" | "center" | "right")[] = []
): void {
  values.forEach((v, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = v;
    c.alignment = { horizontal: align[i] ?? "center", vertical: "middle" };
    c.font = { size: 10 };
  });
  applyBorderRange(ws, row, 1, row, values.length);
  ws.getRow(row).height = 18;
}

/** タイトル行(全列結合・太字) */
export function writeTitle(ws: Worksheet, row: number, cols: number, text: string): void {
  ws.mergeCells(row, 1, row, cols);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { size: 14, bold: true };
  c.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(row).height = 26;
}

/** Excel のシート名に使えない文字を除き、31文字に収める */
export function sheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";
}

/** ワークブックをダウンロードさせる */
export async function downloadWorkbook(wb: Workbook, filename: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
