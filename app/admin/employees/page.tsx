"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/db/DataContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { BigButton } from "@/components/ui/BigButton";
import { Card, BackButton, PageTitle, Badge } from "@/components/ui/Common";
import { todayYmd, formatDateJp } from "@/lib/format";
import { genId } from "@/lib/db/store";
import { currentCondition } from "@/lib/domain/conditions";
import { downloadEmployeeRoster } from "@/lib/export/employeeRosterXlsx";
import {
  EMPLOYMENT_TYPE_LABEL,
  GENDER_LABEL,
  JOB_TYPE_LABEL,
  PAY_BASIS_LABEL,
  type Employee,
  type EmploymentCondition,
  type EmploymentType,
  type Gender,
  type JobType,
  type PayBasis,
} from "@/lib/types";

interface FormState {
  name: string;
  nameKana: string;
  gender: Gender | "";
  birthDate: string;
  address: string;
  phone: string;
  joinedOn: string;
  jobTypes: JobType[];
  note: string;
  retired: boolean;
  retiredOn: string;
  retireReason: string;
  employmentType: EmploymentType;
  payBasis: PayBasis;
  baseRate: string;
  scheduledStartTime: string;
  scheduledDailyMinutes: string;
}

const EMPTY: FormState = {
  name: "",
  nameKana: "",
  gender: "",
  birthDate: "",
  address: "",
  phone: "",
  joinedOn: "",
  jobTypes: ["laborer"],
  note: "",
  retired: false,
  retiredOn: "",
  retireReason: "",
  employmentType: "employee",
  payBasis: "daily",
  baseRate: "",
  scheduledStartTime: "08:00",
  scheduledDailyMinutes: "480",
};

function yesterdayOf(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function EmployeesPage() {
  const { db, insert, update } = useData();
  const { currentUser } = useAuth();
  const today = todayYmd();
  // null=フォーム閉, "new"=新規追加, それ以外=従業員IDを編集
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY, joinedOn: today });
  const [showRetired, setShowRetired] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const employees = useMemo(
    () => db.employees.filter((e) => e.role === "employee" && (showRetired || e.active)),
    [db.employees, showRetired]
  );

  if (!currentUser) return null;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => {
    setForm({ ...EMPTY, joinedOn: today });
    setError(null);
    setEditing("new");
  };

  const openEdit = (e: Employee) => {
    const cond = currentCondition(db, e.id);
    setForm({
      name: e.name,
      nameKana: e.nameKana ?? "",
      gender: e.gender ?? "",
      birthDate: e.birthDate ?? "",
      address: e.address ?? "",
      phone: e.phone ?? "",
      joinedOn: e.joinedOn,
      jobTypes: e.jobTypes,
      note: e.note ?? "",
      retired: !e.active,
      retiredOn: e.retiredOn ?? "",
      retireReason: e.retireReason ?? "",
      employmentType: cond?.employmentType ?? "employee",
      payBasis: cond?.payBasis ?? "daily",
      baseRate: cond ? String(cond.baseRate) : "",
      scheduledStartTime: cond?.scheduledStartTime ?? "08:00",
      scheduledDailyMinutes: cond ? String(cond.scheduledDailyMinutes) : "480",
    });
    setError(null);
    setEditing(e.id);
  };

  const close = () => setEditing(null);

  const buildCondition = (employeeId: string, effectiveFrom: string): EmploymentCondition => ({
    id: genId("cond"),
    employeeId,
    employmentType: form.employmentType,
    payBasis: form.payBasis,
    baseRate: Number(form.baseRate) || 0,
    overtimeMultiplier: 1.25,
    scheduledDailyMinutes: Number(form.scheduledDailyMinutes) || 480,
    scheduledStartTime: form.scheduledStartTime || "08:00",
    monthlyOvertimeLimitMinutes: 45 * 60,
    maxConsecutiveDays: 6,
    effectiveFrom,
    effectiveTo: null,
  });

  const save = () => {
    if (!form.name.trim()) return setError("氏名を入力してください。");
    if (!form.joinedOn) return setError("雇入れ日を入力してください。");
    if (form.jobTypes.length === 0) return setError("職種を1つ以上選んでください。");
    if (form.retired && !form.retiredOn) return setError("退職日を入力してください。");

    const fields = {
      name: form.name.trim(),
      nameKana: form.nameKana.trim() || undefined,
      gender: form.gender || undefined,
      birthDate: form.birthDate || undefined,
      address: form.address.trim() || undefined,
      phone: form.phone.trim() || undefined,
      joinedOn: form.joinedOn,
      jobTypes: form.jobTypes,
      note: form.note.trim() || undefined,
      retiredOn: form.retired ? form.retiredOn : null,
      retireReason: form.retired ? form.retireReason.trim() || undefined : undefined,
      active: !form.retired,
    };

    if (editing === "new") {
      const empId = genId("emp");
      const emp: Employee = { id: empId, loginId: genId("user"), role: "employee", ...fields };
      insert("employees", emp, currentUser.id);
      insert("employmentConditions", buildCondition(empId, form.joinedOn), currentUser.id);
    } else if (editing) {
      update("employees", editing, fields, currentUser.id);
      // 雇用条件が変わっていれば履歴として新しい条件を追加し、旧条件を閉じる
      const cur = currentCondition(db, editing);
      const changed =
        !cur ||
        cur.employmentType !== form.employmentType ||
        cur.payBasis !== form.payBasis ||
        cur.baseRate !== (Number(form.baseRate) || 0) ||
        cur.scheduledStartTime !== form.scheduledStartTime ||
        cur.scheduledDailyMinutes !== (Number(form.scheduledDailyMinutes) || 480);
      if (changed) {
        if (cur) update("employmentConditions", cur.id, { effectiveTo: yesterdayOf(today) }, currentUser.id, "雇用条件の変更");
        insert("employmentConditions", buildCondition(editing, cur ? today : form.joinedOn), currentUser.id, "雇用条件の変更");
      }
      if (form.retired && cur && !cur.effectiveTo) {
        update("employmentConditions", cur.id, { effectiveTo: form.retiredOn }, currentUser.id, "退職");
      }
    }
    close();
  };

  const exportRoster = async () => {
    setExporting(true);
    try {
      await downloadEmployeeRoster(db);
    } finally {
      setExporting(false);
    }
  };

  const toggleJob = (j: JobType) =>
    set("jobTypes", form.jobTypes.includes(j) ? form.jobTypes.filter((x) => x !== j) : [...form.jobTypes, j]);

  const inputCls = "w-full rounded-xl border border-gray-300 p-3 text-base";
  const label = (t: string) => <span className="mb-1 block text-sm font-bold text-gray-500">{t}</span>;

  return (
    <div className="space-y-5">
      <BackButton href="/admin" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle>従業員マスター（労働者名簿）</PageTitle>
        <div className="flex gap-2">
          <button type="button" onClick={exportRoster} disabled={exporting} className="rounded-2xl bg-green-600 px-4 py-3 font-bold text-white active:bg-green-700 disabled:bg-gray-300">
            {exporting ? "出力中…" : "名簿を Excel"}
          </button>
          <BigButton color="blue" size="md" className="w-auto px-5" onClick={editing === "new" ? close : openNew}>
            {editing === "new" ? "閉じる" : "＋ 追加"}
          </BigButton>
        </div>
      </div>
      <p className="text-gray-600">
        労働者名簿の記載事項(氏名・生年月日・性別・住所・業務・雇入れ日・退職日と事由)と雇用条件を管理します。退職者の情報も3年間は残します。
      </p>

      {editing && (
        <Card className="space-y-4 border-blue-200">
          <div className="font-bold text-gray-700">{editing === "new" ? "従業員を追加" : "従業員を編集"}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>{label("氏名 *")}<input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="氏名" className={inputCls} /></label>
            <label>{label("フリガナ")}<input value={form.nameKana} onChange={(e) => set("nameKana", e.target.value)} placeholder="フリガナ" className={inputCls} /></label>
            <label>{label("性別")}
              <select value={form.gender} onChange={(e) => set("gender", e.target.value as Gender | "")} className={inputCls}>
                <option value="">未設定</option>
                {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}
              </select>
            </label>
            <label>{label("生年月日")}<input type="date" value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} className={inputCls} /></label>
            <label className="sm:col-span-2">{label("住所")}<input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="住所" className={inputCls} /></label>
            <label>{label("電話")}<input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="090-0000-0000" className={inputCls} /></label>
            <label>{label("雇入れ日 *")}<input type="date" value={form.joinedOn} onChange={(e) => set("joinedOn", e.target.value)} className={inputCls} /></label>
            <div className="sm:col-span-2">
              {label("従事する業務(職種) *")}
              <div className="flex flex-wrap gap-2">
                {(Object.keys(JOB_TYPE_LABEL) as JobType[]).map((j) => (
                  <button key={j} type="button" onClick={() => toggleJob(j)}
                    className={`rounded-xl border-2 px-3 py-2 font-bold ${form.jobTypes.includes(j) ? "border-blue-600 bg-blue-50 text-blue-900" : "border-gray-200 bg-white text-gray-700"}`}>
                    {JOB_TYPE_LABEL[j]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-gray-50 p-3">
            <div className="mb-2 text-sm font-bold text-gray-700">雇用条件(変更すると今日から新しい条件として履歴に残ります)</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label>{label("雇用区分")}
                <select value={form.employmentType} onChange={(e) => set("employmentType", e.target.value as EmploymentType)} className={inputCls}>
                  {(Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[]).map((t) => <option key={t} value={t}>{EMPLOYMENT_TYPE_LABEL[t]}</option>)}
                </select>
              </label>
              <label>{label("単価区分")}
                <select value={form.payBasis} onChange={(e) => set("payBasis", e.target.value as PayBasis)} className={inputCls}>
                  {(Object.keys(PAY_BASIS_LABEL) as PayBasis[]).map((t) => <option key={t} value={t}>{PAY_BASIS_LABEL[t]}</option>)}
                </select>
              </label>
              <label>{label("基本単価(円)")}<input type="number" value={form.baseRate} onChange={(e) => set("baseRate", e.target.value)} className={inputCls} /></label>
              <label>{label("予定開始時刻")}<input type="time" value={form.scheduledStartTime} onChange={(e) => set("scheduledStartTime", e.target.value)} className={inputCls} /></label>
              <label>{label("所定労働時間(分/日)")}<input type="number" value={form.scheduledDailyMinutes} onChange={(e) => set("scheduledDailyMinutes", e.target.value)} className={inputCls} /></label>
            </div>
          </div>

          <label className="block">{label("備考")}<input value={form.note} onChange={(e) => set("note", e.target.value)} className={inputCls} /></label>

          {editing !== "new" && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <label className="flex items-center gap-2 font-bold text-gray-800">
                <input type="checkbox" checked={form.retired} onChange={(e) => set("retired", e.target.checked)} className="h-5 w-5" />
                退職(ログインできなくなります。記録は残ります)
              </label>
              {form.retired && (
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label>{label("退職日 *")}<input type="date" value={form.retiredOn} onChange={(e) => set("retiredOn", e.target.value)} className={inputCls} /></label>
                  <label>{label("退職事由")}<input value={form.retireReason} onChange={(e) => set("retireReason", e.target.value)} placeholder="例: 自己都合" className={inputCls} /></label>
                </div>
              )}
            </div>
          )}

          {error && <div className="rounded-xl bg-red-50 p-3 font-bold text-red-700">{error}</div>}
          <BigButton color="green" size="md" onClick={save}>
            {editing === "new" ? "登録する" : "保存する"}
          </BigButton>
        </Card>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} className="h-5 w-5" />
        退職者も表示する
      </label>

      <div className="space-y-3">
        {employees.map((e) => {
          const cond = currentCondition(db, e.id);
          return (
            <Card key={e.id} className={e.active ? "" : "opacity-70"}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xl font-bold text-gray-900">{e.name}</div>
                    {!e.active && <Badge tone="gray">退職 {e.retiredOn ? formatDateJp(e.retiredOn) : ""}</Badge>}
                    {cond && <Badge tone="blue">{EMPLOYMENT_TYPE_LABEL[cond.employmentType]}</Badge>}
                  </div>
                  <div className="mt-0.5 text-sm text-gray-500">
                    {e.jobTypes.map((j) => JOB_TYPE_LABEL[j]).join("・")} ／ 雇入れ {formatDateJp(e.joinedOn)}
                    {cond && ` ／ ${PAY_BASIS_LABEL[cond.payBasis]} ${cond.baseRate.toLocaleString("ja-JP")}円 ／ ${cond.scheduledStartTime}〜`}
                  </div>
                </div>
                <button type="button" onClick={() => openEdit(e)} className="shrink-0 rounded-lg bg-gray-100 px-4 py-2 text-sm font-bold text-gray-700 active:bg-gray-200">編集</button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
