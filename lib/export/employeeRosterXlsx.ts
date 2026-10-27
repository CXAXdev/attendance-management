import type { Database } from "@/lib/types";
import { EMPLOYMENT_TYPE_LABEL, GENDER_LABEL, JOB_TYPE_LABEL, PAY_BASIS_LABEL } from "@/lib/types";
import { currentCondition } from "@/lib/domain/conditions";
import { a4, downloadWorkbook, loadExcel, writeHeaderRow, writeRow, writeTitle } from "./xlsxUtil";

// 労働者名簿(労基法107条・労基則53条)。退職者も含めて出力する(退職から3年保存)。

const COLUMNS: [string, number][] = [
  ["氏名", 14],
  ["フリガナ", 16],
  ["性別", 5],
  ["生年月日", 11],
  ["住所", 30],
  ["従事する業務", 16],
  ["雇用区分", 9],
  ["雇入れ日", 11],
  ["退職日", 11],
  ["退職事由", 20],
  ["電話", 14],
  ["備考", 20],
];

export async function downloadEmployeeRoster(db: Database): Promise<void> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("労働者名簿", { pageSetup: { ...a4("landscape"), printTitlesRow: "3:3" } });
  const cols = COLUMNS.length;
  writeTitle(ws, 1, cols, `労働者名簿  (${new Date().toLocaleDateString("ja-JP")} 現在)`);
  ws.mergeCells(2, 1, 2, cols);
  ws.getCell(2, 1).value = "※ 退職者は退職日から3年間保存する。";
  ws.getCell(2, 1).font = { size: 9 };
  writeHeaderRow(ws, 3, COLUMNS);

  const employees = [...db.employees]
    .filter((e) => e.role === "employee")
    .sort((a, b) => (a.active === b.active ? a.joinedOn.localeCompare(b.joinedOn) : a.active ? -1 : 1));

  let row = 4;
  for (const e of employees) {
    const cond = currentCondition(db, e.id) ?? db.employmentConditions.filter((c) => c.employeeId === e.id).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    writeRow(
      ws,
      row,
      [
        e.name,
        e.nameKana ?? "",
        e.gender ? GENDER_LABEL[e.gender] : "",
        e.birthDate ?? "",
        e.address ?? "",
        e.jobTypes.map((j) => JOB_TYPE_LABEL[j]).join("・"),
        cond ? `${EMPLOYMENT_TYPE_LABEL[cond.employmentType]}(${PAY_BASIS_LABEL[cond.payBasis]})` : "",
        e.joinedOn,
        e.retiredOn ?? "",
        e.retireReason ?? "",
        e.phone ?? "",
        e.note ?? "",
      ],
      ["left", "left", "center", "center", "left", "left", "left", "center", "center", "left", "left", "left"]
    );
    row += 1;
  }
  await downloadWorkbook(wb, "労働者名簿.xlsx");
}
