import type { AttendanceSheet } from "@/lib/domain/attendanceSheet";
import { WEEK } from "@/lib/format";
import { HEADER_FILL, applyBorderRange, downloadWorkbook, loadExcel } from "./xlsxUtil";

// ============================================================================
// 日次出勤表を紙の様式に合わせて .xlsx で出力する。
// 様式: 現場(会社)ブロックを3列×複数段に並べ、下部に現場ごとの人数と合計。
// exceljs はブラウザ用ビルドを動的 import で読み込む(初期バンドルを軽く保つ)。
// ============================================================================

/** 6月 12日(金) 形式のタイトル */
function titleDate(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  const w = WEEK[new Date(`${ymd}T00:00:00`).getDay()];
  return `${m}月 ${d}日(${w})`;
}

// 1段に並べる現場ブロック数
const BLOCKS_PER_BAND = 3;
// 使用する列: [番号, 氏名] × 3ブロック = 6列
const TOTAL_COLS = BLOCKS_PER_BAND * 2;
// 各現場ブロックの固定行数(人数が少ないときは空欄=手書き用)
export const FIXED_ROWS_PER_BLOCK = 12;


export async function downloadAttendanceSheet(
  sheet: AttendanceSheet
): Promise<void> {
  const ExcelJS = await loadExcel();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("出勤表", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.5,
        right: 0.5,
        top: 0.6,
        bottom: 0.6,
        header: 0.3,
        footer: 0.3,
      },
    },
  });

  // 列幅: 番号列は狭く、氏名列は広く
  for (let c = 1; c <= TOTAL_COLS; c++) {
    ws.getColumn(c).width = c % 2 === 1 ? 4.5 : 20;
  }

  let row = 1;

  // タイトル(全列結合)
  ws.mergeCells(row, 1, row, TOTAL_COLS);
  const titleCell = ws.getCell(row, 1);
  titleCell.value = titleDate(sheet.date);
  titleCell.font = { size: 14, bold: true };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(row).height = 24;
  applyBorderRange(ws, row, 1, row, TOTAL_COLS);
  row += 1;

  // 現場ブロックを3列ずつの段に分けて配置
  for (let i = 0; i < sheet.blocks.length; i += BLOCKS_PER_BAND) {
    const band = sheet.blocks.slice(i, i + BLOCKS_PER_BAND);
    // 固定行数。人数が固定行数を超える現場があればそれに合わせて拡張
    const bandRows = Math.max(
      FIXED_ROWS_PER_BLOCK,
      ...band.map((b) => b.names.length)
    );

    // 見出し行: 各ブロックの氏名列に現場名(黄色)、番号列は空欄
    const headerRow = row;
    band.forEach((b, slot) => {
      const numCol = slot * 2 + 1;
      const nameCol = numCol + 1;
      const hc = ws.getCell(headerRow, nameCol);
      hc.value = b.siteName;
      hc.font = { bold: true };
      hc.alignment = { horizontal: "left", vertical: "middle" };
      hc.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: HEADER_FILL },
      };
      // 番号列の見出しは空欄(罫線のみ)
      ws.getCell(headerRow, numCol).value = null;
    });
    applyBorderRange(ws, headerRow, 1, headerRow, TOTAL_COLS);
    ws.getRow(headerRow).height = 20;
    row += 1;

    // データ行(固定行数。番号は常に印字し、氏名は在籍分のみ・残りは空欄)
    for (let k = 0; k < bandRows; k++) {
      const r = row + k;
      band.forEach((b, slot) => {
        const numCol = slot * 2 + 1;
        const nameCol = numCol + 1;
        ws.getCell(r, numCol).value = k + 1;
        ws.getCell(r, numCol).alignment = { horizontal: "center" };
        if (k < b.names.length) {
          ws.getCell(r, nameCol).value = b.names[k];
        }
      });
      applyBorderRange(ws, r, 1, r, TOTAL_COLS);
      ws.getRow(r).height = 18;
    }
    row += bandRows;

    // 段の間に空白行
    row += 1;
  }

  // 下部集計: 現場名 | 人数 …… 合計
  row += 1;
  const writeSummaryRow = (label: string, count: number, bold = false) => {
    ws.mergeCells(row, 1, row, 2);
    const labelCell = ws.getCell(row, 1);
    labelCell.value = label;
    labelCell.font = { bold };
    labelCell.alignment = { horizontal: "left", vertical: "middle" };
    const countCell = ws.getCell(row, 3);
    countCell.value = count;
    countCell.font = { bold };
    countCell.alignment = { horizontal: "center", vertical: "middle" };
    applyBorderRange(ws, row, 1, row, 3);
    ws.getRow(row).height = 20;
    row += 1;
  };
  for (const s of sheet.summary) writeSummaryRow(s.siteName, s.count);
  writeSummaryRow("合計", sheet.total, true);

  // ダウンロード
  await downloadWorkbook(wb, `出勤表_${sheet.date}.xlsx`);
}

