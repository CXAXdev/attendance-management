// 機能の表示/非表示フラグ。
// 「まずはシンプルに使いたい」段階で一部機能をメニューから隠すための切替。
// システム(ルート/ロジック)は残してあるので、true に戻すだけで復活する。
export const FEATURES = {
  /** AI半自動シフト生成(/admin/shifts/generate) */
  aiShiftGen: false,
  /** 給与計算(/admin/payroll) */
  payroll: false,
  /** 労務チェック(/admin/compliance) */
  compliance: true,
} as const;
