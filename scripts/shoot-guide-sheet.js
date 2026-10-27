const path = require("path");
const { chromium } = require("playwright-core");
const OUT = process.argv[2];
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, locale: "ja-JP" });
  await ctx.addInitScript(() => { localStorage.setItem("kintai-session-v1", "emp-admin"); localStorage.setItem("kintai-guide-auto-v1", "off"); });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/admin/attendance-sheet"); await page.waitForTimeout(900);
  // 2日前(平日)を選ぶ。週末なら平日まで戻す
  const d = new Date(); d.setDate(d.getDate() - 2); while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() - 1);
  const ymd = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  await page.fill("#sheet-date", ymd); await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/admin-sheet.png` });
  await browser.close(); console.log("sheet", ymd);
})().catch((e) => { console.error(e); process.exit(1); });
