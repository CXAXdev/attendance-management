// シフト作成の「作業下書き」を localStorage に保存する(最大3枠)。
// 本番シフト(モックDB)とは別物で、保存しただけでは従業員のシフト表には反映されない。
// 「更新」を押して初めて本番シフト(shifts/shiftAssignments)へ反映される。

/** 下書き1件の割当(まだ本番シフトではない素の予定) */
export interface DraftAssign {
  date: string; // YYYY-MM-DD
  siteId: string;
  employeeId: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

/** 保存枠1つ分 */
export interface ShiftDraftSlot {
  savedAt: string; // ISO datetime
  items: DraftAssign[];
}

const KEY = "kintai-shift-drafts-v1";
export const SHIFT_DRAFT_SLOTS = 3;

function emptySlots(): (ShiftDraftSlot | null)[] {
  return Array.from({ length: SHIFT_DRAFT_SLOTS }, () => null);
}

export function loadShiftDrafts(): (ShiftDraftSlot | null)[] {
  if (typeof window === "undefined") return emptySlots();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptySlots();
    const parsed = JSON.parse(raw) as (ShiftDraftSlot | null)[];
    const arr = emptySlots();
    for (let i = 0; i < SHIFT_DRAFT_SLOTS; i++) arr[i] = parsed[i] ?? null;
    return arr;
  } catch {
    return emptySlots();
  }
}

export function saveShiftDrafts(slots: (ShiftDraftSlot | null)[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    KEY,
    JSON.stringify(slots.slice(0, SHIFT_DRAFT_SLOTS))
  );
}
