import type { AlcoholCheckLog } from "@/lib/domain/alcoholCheck";
import type { Database } from "@/lib/types";
import { formatTime, formatDateShortJp } from "@/lib/format";
import { HEADER_FILL, applyBorderRange, downloadWorkbook, loadExcel } from "./xlsxUtil";

// ============================================================================
// アルコールチェック記録簿を .xlsx で出力する(1年保存する帳票)。
// 様式: 1行 = 1人×1日(出勤前の1回)。検出ありは赤字で強調する。
// 確認は必ず検知器で行う運用のため、確認方法は固定値で印字する。
// exceljs はブラウザ用ビルドを動的 import で読み込む(初期バンドルを軽く保つ)。
// ============================================================================

const DETECTED_FONT = { bold: true, color: { argb: "FFC00000" } };


/** 列定義: [見出し, 幅] */
const COLUMNS: [string, number][] = [
  ["日付", 12],
  ["氏名", 18],
  ["現場", 24],
  ["確認時刻", 11],
  ["確認方法", 11],
  ["酒気帯び", 12],
  ["確認者", 16],
  ["備考", 30],
];

/** 酒気帯びの列番号(強調に使う) */
const DETECTED_COL = 6;

export async function downloadAlcoholCheckLog(
  log: AlcoholCheckLog,
  db: Database
): Promise<void> {
  const ExcelJS = await loadExcel();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("記録簿", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "landscape",
      // 見出し行(3行目)を各ページで繰り返す
      printTitlesRow: "3:3",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.6,
        bottom: 0.6,
        header: 0.3,
        footer: 0.3,
      },
    },
    views: [{ state: "frozen", ySplit: 3 }],
  });

  const lastCol = COLUMNS.length;
  COLUMNS.forEach(([, width], i) => {
    ws.getColumn(i + 1).width = width;
  });

  const empName = (id: string) =>
    db.employees.find((e) => e.id === id)?.name ?? "";

  let row = 1;

  // タイトル
  ws.mergeCells(row, 1, row, lastCol);
  const title = ws.getCell(row, 1);
  title.value = `アルコールチェック記録簿  ${log.year}年${log.month}月`;
  title.font = { size: 14, bold: true };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(row).height = 26;
  row += 1;

  // 注記(保存義務)
  ws.mergeCells(row, 1, row, lastCol);
  const note = ws.getCell(row, 1);
  note.value =
    "※ 確認はアルコール検知器による。本記録は1年間保存すること。酒気帯び「有」の場合は乗務・作業を行わせないこと。";
  note.font = { size: 9 };
  note.alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(row).height = 16;
  row += 1;

  // 見出し
  const headerRow = row;
  COLUMNS.forEach(([label], i) => {
    const c = ws.getCell(headerRow, i + 1);
    c.value = label;
    c.font = { bold: true, size: 10 };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
  });
  applyBorderRange(ws, headerRow, 1, headerRow, lastCol);
  ws.getRow(headerRow).height = 24;
  row += 1;

  // データ行
  for (const r of log.rows) {
    const values: (string | number)[] = [
      formatDateShortJp(r.date),
      r.employeeName,
      r.siteName,
      r.check ? formatTime(r.check.checkedAt) : "",
      r.check ? "検知器" : "",
      r.check ? (r.check.detected ? "有" : "無") : r.missing ? "未実施" : "",
      r.check ? empName(r.check.confirmerId) : "",
      r.check?.note ?? "",
    ];

    values.forEach((v, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = v;
      c.alignment = {
        // 氏名・現場・確認者・備考は左寄せ、それ以外は中央
        horizontal: i === 1 || i === 2 || i === 6 || i === 7 ? "left" : "center",
        vertical: "middle",
      };
      c.font = { size: 10 };
    });

    // 検出あり・未実施は目立たせる
    const detectedCell = ws.getCell(row, DETECTED_COL);
    if (r.check?.detected) detectedCell.font = { size: 10, ...DETECTED_FONT };
    if (r.missing)
      detectedCell.font = { size: 10, bold: true, color: { argb: "FFB45309" } };

    applyBorderRange(ws, row, 1, row, lastCol);
    ws.getRow(row).height = 18;
    row += 1;
  }

  // 集計
  row += 1;
  ws.mergeCells(row, 1, row, lastCol);
  const summary = ws.getCell(row, 1);
  summary.value = `記録 ${log.recordCount}件 / 酒気帯びあり ${log.detectedCount}件 / 未実施 ${log.missingCount}件`;
  summary.font = { bold: true, size: 10 };
  summary.alignment = { horizontal: "left", vertical: "middle" };

  await downloadWorkbook(wb, `アルコールチェック記録簿_${log.year}-${String(log.month).padStart(2, "0")}.xlsx`);
}

