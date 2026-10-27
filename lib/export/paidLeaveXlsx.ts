import type { Database } from "@/lib/types";
import { OBLIGATION_LABEL, allPaidLeaveSummaries, paidLeaveLedger } from "@/lib/domain/paidLeave";
import { a4, downloadWorkbook, loadExcel, writeHeaderRow, writeRow, writeTitle } from "./xlsxUtil";

// 年次有給休暇管理簿(労基則24条の7): 基準日・付与日数・取得日・残日数。

export async function downloadPaidLeaveLedger(db: Database, asOf: string): Promise<void> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();

  // 一覧
  const sum = wb.addWorksheet("一覧", { pageSetup: { ...a4("portrait"), printTitlesRow: "2:2" } });
  const SUM_COLS: [string, number][] = [
    ["氏名", 14], ["在籍", 6], ["直近の基準日", 12], ["有効付与", 9], ["取得", 7], ["残日数", 8], ["基準日からの取得", 12], ["5日義務の期限", 12], ["判定", 14],
  ];
  writeTitle(sum, 1, SUM_COLS.length, `年次有給休暇管理簿  (${asOf} 現在)`);
  writeHeaderRow(sum, 2, SUM_COLS);
  let row = 3;
  for (const s of allPaidLeaveSummaries(db, asOf)) {
    writeRow(sum, row, [
      s.name, s.active ? "在籍" : "退職", s.lastGrantDate ?? "", s.granted, s.used, s.balance,
      s.obligation.baseDate ? `${s.obligation.usedInYear}日` : "", s.obligation.deadline ?? "", OBLIGATION_LABEL[s.obligation.status],
    ], ["left", "center", "center", "center", "center", "center", "center", "center", "left"]);
    row += 1;
  }

  // 明細(全員)
  const det = wb.addWorksheet("明細", { pageSetup: { ...a4("portrait"), printTitlesRow: "2:2" } });
  const DET_COLS: [string, number][] = [["氏名", 14], ["日付", 12], ["区分", 7], ["日数", 7], ["時効", 12], ["残日数", 8], ["備考", 24]];
  writeTitle(det, 1, DET_COLS.length, "年次有給休暇 付与・取得の明細");
  writeHeaderRow(det, 2, DET_COLS);
  row = 3;
  for (const e of db.employees.filter((x) => x.role === "employee")) {
    for (const l of paidLeaveLedger(db, e.id)) {
      writeRow(det, row, [e.name, l.date, l.kind === "grant" ? "付与" : "取得", l.days, l.expiresOn ?? "", l.runningBalance, l.note ?? ""],
        ["left", "center", "center", "center", "center", "center", "left"]);
      row += 1;
    }
  }
  await downloadWorkbook(wb, `年次有給休暇管理簿_${asOf}.xlsx`);
}
