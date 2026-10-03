// The app's store art — icon, Android adaptive icon (and its monochrome layer),
// splash mark, favicon — rasterised with resvg. Run with:
//
//   npm run art:build
//
// Same bargain as the level bank and the sounds: this script is the source, the
// PNGs in assets/images are its baked output.
//
// **The icon is painted, the rest is drawn.** The icon's picture is
// `assets/source/icon-art.png`, made with Google's Nano Banana 2 Lite
// (gemini-3.1-flash-lite-image) from the old hand-drawn icon as its reference:
// the same top-down scene — chequered lawn, a road bending from the left edge
// down to the bottom, a red car on the bend, toy houses and trees — with the car
// grown into the hero. The flat drawing it replaced was the board's own parts
// at board scale, and at 60px on a home screen that was a lot of lawn and a
// small car; a store icon has to read from across a shelf of other icons. The
// in-game art stays drawn: the icon is the one picture that is a poster rather
// than a piece of the board. Regenerating it is a manual step, not part of this
// script — the master is checked in, and this script only frames it.
//
// Everything else stays drawn here from the game's own numbers: the splash is
// the wordmark exactly as `Logo.tsx` sets it (CONNECT over R◎ADS, the O a
// roundabout), so the native splash hands over to the title scene without the
// logo changing shape, and the monochrome layer Android 13+ tints for themed
// icons is the icon's road and car as one silhouette.

import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const OUT = join(ROOT, "assets", "images");
const ART = join(ROOT, "assets", "source", "icon-art.png");
const FEATURE_ART = join(ROOT, "assets", "source", "feature-art.png");
/** Store listing art: uploaded by hand, never bundled into the app. */
const STORE = join(ROOT, "store");
const require = createRequire(import.meta.url);
const FONT = require.resolve("@expo-google-fonts/fredoka/700Bold/Fredoka_700Bold.ttf");
const FONT_SEMI = require.resolve("@expo-google-fonts/fredoka/600SemiBold/Fredoka_600SemiBold.ttf");
const FONTS = { fontFiles: [FONT, FONT_SEMI], loadSystemFonts: false, defaultFontFamily: "Fredoka" };

const C = {
  kerb: "#DAD5C8",
  asphalt: "#4B5263",
  roadLine: "#FFD23F",
  lawnA: "#8DD05F",
  bush: "#4E9E37",
  bushLight: "#63B847",
  ink: "#2E2A45",
  orange: "#FF8A3D",
  gold: "#FFC83D",
};

const art = `data:image/png;base64,${readFileSync(ART).toString("base64")}`;

/** The painted icon, full bleed — optionally with the corners rounded off (the favicon). */
function iconSvg(size = 1024, rounded = false) {
  const clip = rounded ? `<clipPath id="r"><rect width="${size}" height="${size}" rx="${size * 0.22}"/></clipPath>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>${clip}</defs>
  <image ${rounded ? 'clip-path="url(#r)"' : ""} width="${size}" height="${size}" href="${art}" xlink:href="${art}"/>
</svg>`;
}

/**
 * Android 13+'s themed icon: one flat shape the launcher tints. The road bend
 * and the car from the painted icon as a silhouette — the dashes and the
 * windows cut out, and a gap round the car so it stands off the road — kept
 * inside the circle every launcher mask leaves whole.
 */
function monochromeSvg(size = 1024) {
  const u = size / 1024;
  // The bend: in from the left, a quarter turn, out at the bottom.
  const R = 140;
  const [ax, ay] = [520, 540]; // the bend's centre
  const road = `M ${300 * u},${(ay - R) * u} H ${ax * u} A ${R * u},${R * u} 0 0 1 ${(ax + R) * u},${ay * u} V ${740 * u}`;
  // The car sits on the bend's midpoint, nose along the road.
  const mx = ax + R * Math.SQRT1_2;
  const my = ay - R * Math.SQRT1_2;
  const L = 176;
  const Wd = 110;
  const carShape = (fill: string, stroke = "") =>
    `<g transform="translate(${mx * u},${my * u}) rotate(45)" fill="${fill}" ${stroke}>
      ${[-0.3, 0.3].flatMap((fx) => [-1, 1].map((fy) => `<rect x="${(fx * L - 22) * u}" y="${(fy * (Wd / 2 + 5) - 11) * u}" width="${44 * u}" height="${22 * u}" rx="${10 * u}"/>`)).join("")}
      <rect x="${(-L / 2) * u}" y="${(-Wd / 2) * u}" width="${L * u}" height="${Wd * u}" rx="${40 * u}"/>
    </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="black"/>
      <path d="${road}" stroke="white" stroke-width="${124 * u}" fill="none"/>
      <path d="${road}" stroke="black" stroke-width="${14 * u}" stroke-dasharray="${36 * u} ${30 * u}" fill="none"/>
      ${carShape("black", `stroke="black" stroke-width="${30 * u}" stroke-linejoin="round"`)}
      ${carShape("white")}
      <g transform="translate(${mx * u},${my * u}) rotate(45)" fill="black">
        <rect x="${18 * u}" y="${-38 * u}" width="${28 * u}" height="${76 * u}" rx="${12 * u}"/>
        <rect x="${-60 * u}" y="${-35 * u}" width="${22 * u}" height="${70 * u}" rx="${10 * u}"/>
      </g>
    </mask>
  </defs>
  <rect width="${size}" height="${size}" fill="#FFFFFF" mask="url(#m)"/>
</svg>`;
}

/** The ink box of a run of Fredoka Bold, measured by the same renderer that will draw it. */
function measure(text: string, size: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="1000">
    <text x="1000" y="500" font-family="Fredoka" font-weight="700" font-size="${size}">${text}</text></svg>`;
  const box = new Resvg(svg, { font: FONTS }).getBBox();
  if (!box) throw new Error(`could not measure ${text}`);
  return { left: box.x - 1000, top: box.y - 500, width: box.width, height: box.height };
}

/** The splash mark's canvas, once `splashSvg` has laid it out. */
const MARK = { w: 1200, h: 520 };

/**
 * The splash mark: the wordmark as `Logo` sets it — CONNECT small and gold over
 * ROADS, the O a roundabout — in `Display`'s outline (a stroke of 0.055 of the
 * size each side) and drop shadow (0.09 of the size), on transparent.
 */
function splashSvg() {
  const S = 300; // ROADS
  const small = S * 0.46; // CONNECT
  const word = (text: string, x: number, y: number, size: number, fill: string) => {
    const k = Math.max(1.5, size * 0.055);
    const d = Math.max(2, size * 0.09);
    const common = `x="${x}" y="${y}" font-family="Fredoka" font-weight="700" font-size="${size}"`;
    const stroke = `stroke="${C.ink}" stroke-width="${k * 2}" stroke-linejoin="round"`;
    return `<text ${common} dy="${d}" fill="${C.ink}" ${stroke}>${text}</text>
      <text ${common} fill="${fill}" ${stroke} paint-order="stroke">${text}</text>`;
  };
  const r = measure("R", S);
  const ads = measure("ADS", S);
  const con = measure("CONNECT", small);
  const k = S * 0.055;

  // The roundabout, as `Roundabout` draws it at 0.86 of the size.
  const s = S * 0.86;
  const edge = s * 0.06;
  const outer = s / 2 - edge;
  const roadR = outer - s * 0.04;
  const ring = s * 0.2;
  const rim = outer + edge * 0.5;
  const gap = S * 0.08;

  // Lay the row out on ink boxes, outline included, then centre it on the canvas.
  const rowW = r.width + 2 * k + gap + rim * 2 + gap + ads.width + 2 * k;
  const W = 1200;
  const x0 = (W - rowW) / 2;
  const baseline = 520;
  const rX = x0 + k - r.left;
  const cx = x0 + r.width + 2 * k + gap + rim;
  const adsX = cx + rim + gap + k - ads.left;
  // The ring sits on the letters' middle, a touch high, as it does in the app.
  const cy = baseline + ads.top + ads.height / 2 - S * 0.02;
  const conX = W / 2 - con.width / 2 - con.left;
  // CONNECT tucks down onto ROADS the way `Logo`'s negative margin pulls it.
  const conBase = baseline + ads.top - S * 0.14 - (con.top + con.height) - small * 0.09;
  const H = Math.ceil(baseline + S * 0.2 + 40);
  const top = Math.floor(conBase + con.top - k - 40);

  MARK.w = W;
  MARK.h = H - top;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H - top}" viewBox="0 ${top} ${W} ${H - top}">
  ${word("CONNECT", conX, conBase, small, C.gold)}
  ${word("R", rX, baseline, S, C.orange)}
  ${word("ADS", adsX, baseline, S, C.orange)}
  <circle cx="${cx}" cy="${cy + s * 0.1}" r="${outer}" fill="${C.ink}"/>
  <circle cx="${cx}" cy="${cy}" r="${rim}" fill="${C.ink}"/>
  <circle cx="${cx}" cy="${cy}" r="${outer}" fill="${C.kerb}"/>
  <circle cx="${cx}" cy="${cy}" r="${roadR}" fill="${C.asphalt}"/>
  <circle cx="${cx}" cy="${cy}" r="${roadR - ring}" fill="${C.kerb}"/>
  <circle cx="${cx}" cy="${cy}" r="${roadR - ring - s * 0.03}" fill="${C.lawnA}"/>
  <circle cx="${cx}" cy="${cy}" r="${roadR - ring / 2}" stroke="${C.roadLine}" stroke-width="${s * 0.04}" stroke-dasharray="${s * 0.09} ${s * 0.08}" fill="none"/>
  <circle cx="${cx}" cy="${cy}" r="${s * 0.1}" fill="${C.bush}"/>
  <circle cx="${cx - s * 0.03}" cy="${cy - s * 0.03}" r="${s * 0.055}" fill="${C.bushLight}"/>
</svg>`;
}

/**
 * Google Play's feature graphic, 1024×500: the toy-town landscape (painted, like
 * the icon — `assets/source/feature-art.png`, Nano Banana 2 Lite), cropped so its
 * tray sits right, with the wordmark and the tagline on the open sky at left.
 */
function featureSvg() {
  const W = 1024;
  const H = 500;
  const bg = `data:image/png;base64,${readFileSync(FEATURE_ART).toString("base64")}`;
  // The painting is 1584×672; at the graphic's height it is 1179 wide, and the
  // crop keeps its right-hand end, where the tray is.
  const scale = H / 672;
  const bgW = 1584 * scale;
  const logo = `data:image/png;base64,${render(splashSvg(), 1200).toString("base64")}`;
  const [lw, lh] = [440, 440 * (MARK.h / MARK.w)];
  const lx = 44;
  const ly = 120;
  const tag = "Count the clues · Lay the road";
  const tagSize = 25;
  const tagW = 372;
  const tagX = lx + lw / 2 - tagW / 2;
  const tagY = ly + lh + 14;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <image x="${W - bgW + 8}" y="0" width="${bgW}" height="${H}" href="${bg}" xlink:href="${bg}" preserveAspectRatio="none"/>
  <image x="${lx}" y="${ly}" width="${lw}" height="${lh}" href="${logo}" xlink:href="${logo}"/>
  <rect x="${tagX}" y="${tagY}" width="${tagW}" height="${tagSize * 1.7}" rx="${tagSize * 0.85}" fill="#FFF9EE" opacity="0.92"/>
  <text x="${lx + lw / 2}" y="${tagY + tagSize * 1.17}" text-anchor="middle" font-family="Fredoka" font-weight="600" font-size="${tagSize}" fill="${C.ink}">${tag}</text>
</svg>`;
}

function rasterise(svg: string, width: number) {
  return new Resvg(svg, { fitTo: { mode: "width", value: width }, font: FONTS }).render();
}

const render = (svg: string, width: number) => rasterise(svg, width).asPng();

/**
 * A PNG with no alpha channel at all. App Store Connect refuses a marketing icon
 * that has one, even fully opaque — prebuild strips it today, but the source
 * shouldn't depend on that.
 */
function renderOpaque(svg: string, width: number) {
  const img = rasterise(svg, width);
  const { width: w, height: h } = img;
  const rgba = img.pixels;
  const stride = w * 3;
  const rgb = Buffer.alloc(stride * h);
  for (let p = 0; p < w * h; p++) {
    rgb[p * 3] = rgba[p * 4];
    rgb[p * 3 + 1] = rgba[p * 4 + 1];
    rgb[p * 3 + 2] = rgba[p * 4 + 2];
  }
  // Each row Paeth-filtered: a painted picture is smooth gradients, which an
  // unfiltered PNG stores at nearly raw size.
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    raw[o] = 4;
    for (let x = 0; x < stride; x++) {
      const a = x >= 3 ? rgb[y * stride + x - 3] : 0;
      const b = y > 0 ? rgb[(y - 1) * stride + x] : 0;
      const c = x >= 3 && y > 0 ? rgb[(y - 1) * stride + x - 3] : 0;
      const pa = Math.abs(b - c);
      const pb = Math.abs(a - c);
      const pc = Math.abs(a + b - 2 * c);
      const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[o + 1 + x] = (rgb[y * stride + x] - pred) & 0xff;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

mkdirSync(OUT, { recursive: true });
const outputs: [string, Buffer][] = [
  ["icon.png", renderOpaque(iconSvg(1024), 1024)],
  // Full bleed: the launcher's mask keeps the middle two-thirds, which is the
  // car on its bend — the picture was composed around exactly that.
  ["adaptive-icon.png", renderOpaque(iconSvg(1024), 1024)],
  ["adaptive-icon-mono.png", render(monochromeSvg(1024), 1024)],
  ["splash-icon.png", render(splashSvg(), 600)],
  ["favicon.png", render(iconSvg(1024, true), 64)],
];
for (const [name, png] of outputs) {
  writeFileSync(join(OUT, name), png);
  console.log(`  ${name.padEnd(22)} ${(png.length / 1024).toFixed(1).padStart(7)} kB`);
}

mkdirSync(STORE, { recursive: true });
const feature = renderOpaque(featureSvg(), 1024);
writeFileSync(join(STORE, "feature-graphic.png"), feature);
console.log(`  ${"store/feature-graphic.png".padEnd(22)} ${(feature.length / 1024).toFixed(1).padStart(7)} kB`);
