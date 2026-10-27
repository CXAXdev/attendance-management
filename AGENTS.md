<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# attendance-management — 建築業向け 勤怠・労務管理アプリ（試作）

- スタック: Next.js App Router, TypeScript, Tailwind。データは localStorage のみ（サーバー・認証なし）
- コマンド: `npm run dev` / `npm run lint` / `npx tsc --noEmit` / `npm run build`
- 主要ルート: `/login`, `/employee`（出退勤・休憩・シフト確認・休み希望）, `/admin`（出勤予定ボード）
  - 管理者: `/admin/shifts` `/admin/working` `/admin/attendance`（出勤簿・打刻修正）`/admin/attendance-sheet` `/admin/alcohol-checks` `/admin/paid-leave` `/admin/employees` `/admin/sites` `/admin/compliance` `/admin/reports` `/admin/audit` `/admin/notices` `/admin/settings`
- 構成: `app/providers.tsx` にプロバイダ集約（Data → Auth → Guide）。ドメインロジックは `lib/domain/`、帳票は `lib/export/`（exceljs は `xlsxUtil.ts` 経由で動的 import）
- データ: `lib/db/store.ts`（キー `kintai-db-v10`。スキーマ変更時はキーを上げて `migrateDb` に既定値を足す）、`lib/db/seed.ts`（固定乱数のサンプル。ガイド登場人物 emp-admin/emp-001〜004 は固定）
- 監査ログは `DataContext` の insert/update/remove が自動追記（update は変更フィールドのみ）。連番＋ハッシュ連鎖で改ざん検知
- 画面内ガイド: `lib/guide/tours.ts`（pathname ごとの手順、`data-guide` 属性で対象指定）
- 先方向けガイド: `public/guide/index.html`（アプリ内 `/guide` で表示、画像は `public/guide/img/`、PDF は `public/guide/kintai-guide.pdf`）。再生成は `scripts/shoot-guide.js`（撮影）→ `scripts/build-guide-pdf.js`（PDF）
