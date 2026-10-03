// Raw store captures, played on the web build by a headless browser.
//
//   npx expo export --platform web --output-dir dist
//   (cd dist && python3 -m http.server 8765) &
//   node store/tools/capture.mjs phone 390 844 3     # → store/raw/phone/*.png
//   node store/tools/capture.mjs ipad 1032 1376 2    # → store/raw/ipad/*.png
//   python3 store/tools/compose.py                   # → store/ios-6.9, ipad-13, android-phone
//
// Needs `playwright-core` and a Chromium it can launch (`npx playwright install
// chromium`, or CHROME=/path/to/chrome). Neither is a dependency of the app: this
// is run by hand before a store update, not by the build. Each scene is real
// play — the board is driven along its own solution — so the screenshots can't
// show a state the game doesn't reach.
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const URL = process.env.STORE_URL ?? "http://localhost:8765/";
const [tag, vw, vh, dpr] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4]), Number(process.argv[5])];
const out = path.join(ROOT, "store", "raw", tag); fs.mkdirSync(out, { recursive: true });
const pathOf = (L) => JSON.parse(execSync(`npx tsx store/tools/path.ts ${L}`, { cwd: ROOT }).toString());
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
async function boot(L, extra = {}) {
  const stars = {}; for (let i = 1; i < L; i++) stars[i] = (i % 5 === 0) ? 2 : 3;
  await page.goto(URL);
  await page.evaluate((p) => { localStorage.clear(); localStorage.setItem("tracks.progress.v1", JSON.stringify(p)); },
    { unlockedLevel: L, hints: 5, sound: false, music: false, haptics: true, tutorialSeen: true, learned: ["exits", "overlap", "whatif", "scenery", "fog"], fleet: "classic", stars, ...extra });
  await page.reload(); await page.waitForTimeout(1300);
  await page.mouse.click(vw / 2, vh * 0.7); await page.waitForTimeout(1200);
}
async function openLevel(L) { await boot(L); await page.getByText("Continue", { exact: true }).first().click({ force: true }); await page.waitForTimeout(1800); }
async function grid() { return page.locator('[data-testid="board-grid"]').boundingBox(); }
async function partial(L, frac = 0.5) {
  const info = pathOf(L);
  await openLevel(L);
  const box = await grid(); const cs = box.width / info.size;
  const at = (c) => [box.x + cs * (c.c + 0.5), box.y + cs * (c.r + 0.5)];
  const n = Math.ceil(info.path.length * frac);
  const pts = info.path.slice(0, n);
  let [x, y] = at(pts[0]); await page.mouse.move(x, y); await page.mouse.down();
  for (const c of pts.slice(1)) { [x, y] = at(c); await page.mouse.move(x, y, { steps: 6 }); await page.waitForTimeout(25); }
  await page.mouse.up(); await page.waitForTimeout(300);
  const onPath = new Set(info.path.map((c) => c.r * 100 + c.c));
  const scen = new Set((info.scenery ?? []).map((c) => c.r * 100 + c.c));
  // cross a few empties near the drawn road, claim a couple of road squares further on
  let k = 0;
  for (const c of info.path.slice(n - 3, n + 3)) for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    const r = c.r + dr, cc = c.c + dc;
    if (k >= 5 || r < 0 || cc < 0 || r >= info.size || cc >= info.size || onPath.has(r * 100 + cc) || scen.has(r * 100 + cc)) continue;
    [x, y] = at({ r, c: cc }); await page.mouse.click(x, y); await page.waitForTimeout(380); k++;
  }
  for (const c of info.path.slice(n + 2, n + 5)) { [x, y] = at(c); await page.mouse.click(x, y); await page.waitForTimeout(50); await page.mouse.click(x, y); await page.waitForTimeout(450); }
  await page.mouse.move(0, 0); await page.waitForTimeout(700);
  return info;
}
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log(tag, name); };

// 1 — the front door
await boot(18); await page.waitForTimeout(2500); await shot("1-home");
// 2 — mid-deduction
await partial(62, 0.45); await shot("2-deduce");
// 3 — the win: convoy on the lit road, town grown; then the title
{
  const L = 48; const info = pathOf(L); await openLevel(L);
  const box = await grid(); const cs = box.width / info.size;
  const at = (c) => [box.x + cs * (c.c + 0.5), box.y + cs * (c.r + 0.5)];
  let [x, y] = at(info.path[0]); await page.mouse.move(x, y); await page.mouse.down();
  for (const c of info.path.slice(1)) { [x, y] = at(c); await page.mouse.move(x, y, { steps: 6 }); await page.waitForTimeout(25); }
  await page.mouse.up(); await page.mouse.move(0, 0);
  await page.waitForTimeout(2600); await shot("3-drive");
}
// 4 — a hint that says why
{
  await partial(33, 0.3);
  const hb = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find((d) => { const r = d.getBoundingClientRect(); return Math.abs(r.width - 66) < 2 && Math.abs(r.height - 66) < 2 && getComputedStyle(d).backgroundColor === "rgb(255, 200, 61)"; });
    if (!el) return null; const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];
  });
  if (hb) { await page.mouse.click(hb[0], hb[1]); await page.waitForTimeout(1500); }
  await shot("4-hint");
}
// 5 — the road trip
await boot(23); await page.getByText("All levels").first().click({ force: true }); await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelectorAll("div").forEach((d) => { if (d.scrollHeight > d.clientHeight + 50 && getComputedStyle(d).overflowY !== "visible") d.scrollTop -= 330; }));
await page.waitForTimeout(900); await shot("5-map");
// 6 — new worlds: night and fog
await partial(421, 0.4); await shot("6-lantern");
await browser.close();
