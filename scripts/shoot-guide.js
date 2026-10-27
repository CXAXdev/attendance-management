// ガイド用スクリーンショットを撮る。先に PORT=3100 npm run start を起動しておく。
// 使い方: node scripts/shoot-guide.js public/guide/img

const path = require("path");
const { chromium } = require("playwright-core");
const OUT = process.argv[2];
const BASE = "http://localhost:3100";
const d0 = new Date();
const TODAY = `${d0.getFullYear()}-${String(d0.getMonth()+1).padStart(2,"0")}-${String(d0.getDate()).padStart(2,"0")}`;
const at = (hhmm) => new Date(`${TODAY}T${hhmm}:00`);
const wait = (p, ms = 700) => p.waitForTimeout(ms);
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` });
const scrollTo = async (p, guide) => { await p.locator(`[data-guide="${guide}"]`).first().evaluate(el => el.scrollIntoView({ block: "center" })); await wait(p, 400); };

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  // ---------- 従業員(スマホ) ----------
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ja-JP" });
  await mobile.clock.setFixedTime(at("07:55"));
  let page = await mobile.newPage();

  await page.goto(`${BASE}/login`); await wait(page, 1500);
  await shot(page, "login-guide");
  await page.getByRole("button", { name: "次へ →" }).click(); await wait(page, 1000);
  await shot(page, "login-guide2");
  await page.getByRole("button", { name: "スキップ" }).click(); await wait(page, 300);
  await shot(page, "login");
  await page.evaluate(() => localStorage.setItem("kintai-guide-auto-v1", "off"));
  await page.reload(); await wait(page);

  await page.getByRole("button", { name: /山田 一郎/ }).click();
  await page.waitForURL(`${BASE}/employee`); await wait(page);
  await shot(page, "emp-home");
  await scrollTo(page, "emp-main"); await shot(page, "emp-home-clockin");

  await page.getByRole("button", { name: "出勤", exact: true }).click(); await wait(page, 400);
  await shot(page, "emp-alcohol");
  await page.getByRole("button", { name: "異常なし" }).click(); await wait(page, 300);
  await shot(page, "emp-alcohol-ok");
  await page.getByRole("button", { name: "出勤する" }).click(); await wait(page);
  await scrollTo(page, "emp-main"); await shot(page, "emp-working");

  await page.getByRole("button", { name: /休憩開始/ }).click(); await wait(page, 400);
  await scrollTo(page, "emp-main"); await shot(page, "emp-break");
  await page.getByRole("button", { name: "休憩終了" }).click(); await wait(page, 300);

  // 管理者画面用に「山田が出勤中」の状態を保存
  const dbWorking = await page.evaluate(() => localStorage.getItem("kintai-db-v9"));

  await mobile.clock.setFixedTime(at("17:05"));
  await page.goto(`${BASE}/employee/clockout`); await wait(page);
  await page.fill("textarea", "2階の型枠は南側まで完了。明日は北側から。");
  await shot(page, "emp-clockout");
  await page.getByRole("button", { name: "退勤する" }).click(); await wait(page, 300);
  await scrollTo(page, "clockout-button"); await shot(page, "emp-clockout-confirm");
  await page.getByRole("button", { name: "はい、退勤" }).click();
  await page.waitForURL(`${BASE}/employee`); await wait(page);
  await scrollTo(page, "emp-main"); await shot(page, "emp-done");

  await page.goto(`${BASE}/employee/shift`); await wait(page);
  await shot(page, "emp-shift");

  await mobile.clock.setFixedTime(at("08:40"));
  await page.goto(`${BASE}/employee`); await wait(page);
  await page.getByRole("button", { name: "使い方" }).click(); await wait(page, 300);
  await page.getByRole("button", { name: "次へ →" }).click(); await wait(page, 300);
  await page.getByRole("button", { name: "次へ →" }).click(); await wait(page, 1200);
  await shot(page, "emp-guide");
  await mobile.close();

  // ---------- 管理者(PC) ----------
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, locale: "ja-JP" });
  await desktop.clock.setFixedTime(at("08:40"));
  await desktop.addInitScript(({ db }) => {
    localStorage.setItem("kintai-db-v9", db);
    localStorage.setItem("kintai-session-v1", "emp-admin");
    localStorage.setItem("kintai-guide-auto-v1", "off");
  }, { db: dbWorking });
  page = await desktop.newPage();
  for (const [p, name] of [["/admin","admin-home"],["/admin/working","admin-working"],["/admin/alcohol-checks","admin-alcohol"],["/admin/attendance-sheet","admin-sheet"],["/admin/notices","admin-notices"],["/admin/settings","admin-settings"],["/admin/attendance","admin-ledger"],["/admin/paid-leave","admin-paidleave"],["/admin/compliance","admin-compliance"]]) {
    await page.goto(`${BASE}${p}`); await wait(page, 900); await shot(page, name);
  }
  await page.goto(`${BASE}/admin`); await wait(page, 900);
  await page.locator("button[title='クリックで詳細']").first().click(); await wait(page, 400); await shot(page, "admin-alert");
  await page.goto(`${BASE}/admin/shifts`); await wait(page, 900);
  await page.getByRole("button", { name: /田中 四郎/ }).first().click(); await wait(page, 400);
  await shot(page, "admin-shifts");
  await page.goto(`${BASE}/admin`); await wait(page, 900);
  await page.getByRole("button", { name: "使い方" }).click(); await wait(page, 300);
  await page.getByRole("button", { name: "次へ →" }).click(); await wait(page, 1200);
  await shot(page, "admin-guide");
  await browser.close();
  console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
