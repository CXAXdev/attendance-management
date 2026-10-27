// public/guide/index.html から PDF を生成する(インストール済み Chrome を使用)。
// 使い方: node scripts/build-guide-pdf.js
const path = require("path");
const { chromium } = require("playwright-core");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await page.goto("file://" + path.resolve("public/guide/index.html"), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.pdf({ path: "public/guide/kintai-guide.pdf", format: "A4", printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log("public/guide/kintai-guide.pdf written");
})().catch((e) => { console.error(e); process.exit(1); });
