// The app's store art — icon, Android adaptive icon, splash, favicon — drawn as
// SVG here and rasterised with resvg. Run with:
//   npm run art:build
//
// Same bargain as the level bank and the sounds: this script is the source, the
// PNGs in assets/images are its baked output. The drawing uses the board's own
// numbers (road width, kerb span, the quarter-circle curve of radius half a
// cell), so the icon is a real piece of the game rather than a picture of one.

import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "assets", "images");
const require = createRequire(import.meta.url);
const FONT = require.resolve("@expo-google-fonts/fredoka/700Bold/Fredoka_700Bold.ttf");

const C = {
  lawnA: "#8DD05F",
  lawnB: "#80C654",
  blade: "#6EB344",
  kerb: "#DAD5C8",
  kerbDark: "#BDB6A6",
  asphalt: "#4B5263",
  asphaltEdge: "#353A48",
  edgeLine: "#F3F1EA",
  roadLine: "#FFD23F",
  ink: "#2E2A45",
  skyTop: "#6EC3F5",
  skyLow: "#CDEEFF",
  orange: "#FF8A3D",
  gold: "#FFC83D",
  car: "#FF5A5F",
  carEdge: "#C23A3F",
  carRoof: "#FF8C8F",
  glass: "#2B3346",
  bush: "#4E9E37",
  bushLight: "#63B847",
  roofA: "#5F9DF7",
  roofB: "#FF9F43",
};

/** The icon: a 4×4 lawn with a road entering left, bending down, leaving at the bottom. */
function iconSvg(size = 1024, rounded = false) {
  const s = size / 4;
  const road = 0.46 * s;
  const span = 0.58 * s;
  const y = 1.5 * s;
  const x = 2.5 * s;
  const centre = `M 0,${y} L ${2 * s},${y} A ${s / 2},${s / 2} 0 0 1 ${x},${2 * s} L ${x},${size}`;
  const edgeOff = road / 2 - 0.05 * s;
  const tiles: string[] = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      tiles.push(`<rect x="${c * s}" y="${r * s}" width="${s}" height="${s}" fill="${(r + c) % 2 ? C.lawnB : C.lawnA}"/>`);
  const offsetPath = (o: number) =>
    `M 0,${y + o} L ${2 * s},${y + o} A ${s / 2 - o},${s / 2 - o} 0 0 1 ${x - o},${2 * s} L ${x - o},${size}`;

  const tree = (cx: number, cy: number, r: number) =>
    `<ellipse cx="${cx + r * 0.25}" cy="${cy + r * 0.35}" rx="${r}" ry="${r * 0.9}" fill="#000" opacity="0.16"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.bush}"/>` +
    `<circle cx="${cx - r * 0.28}" cy="${cy - r * 0.28}" r="${r * 0.55}" fill="${C.bushLight}"/>`;
  const house = (x0: number, y0: number, w: number, d: number, roof: string) =>
    `<rect x="${x0 + s * 0.05}" y="${y0 + s * 0.06}" width="${w}" height="${d}" rx="${s * 0.05}" fill="#000" opacity="0.18"/>` +
    `<rect x="${x0}" y="${y0}" width="${w}" height="${d}" rx="${s * 0.05}" fill="${roof}"/>` +
    `<rect x="${x0}" y="${y0 + d / 2}" width="${w}" height="${d / 2}" rx="${s * 0.05}" fill="#000" opacity="0.14"/>`;

  // The car, top-down, pointing east along the first straight.
  const L = s * 0.95;
  const W = s * 0.58;
  const cx0 = s * 0.86;
  const cy0 = y - W / 2;
  const body = W * 0.76;
  const top = W * 0.12;
  const car = `
    <g transform="translate(${cx0},${cy0})">
      <ellipse cx="${L * 0.5}" cy="${W * 0.58}" rx="${L * 0.52}" ry="${W * 0.46}" fill="#000" opacity="0.2"/>
      ${[0.14, 0.66].map((fx) => [0, W * 0.8].map((fy) => `<rect x="${L * fx}" y="${fy}" width="${L * 0.2}" height="${W * 0.2}" rx="${W * 0.08}" fill="#23252E"/>`).join("")).join("")}
      <rect x="2" y="${top}" width="${L - 4}" height="${body}" rx="${body * 0.38}" fill="${C.car}" stroke="${C.carEdge}" stroke-width="${W * 0.05}"/>
      <rect x="${L * 0.54}" y="${top + body * 0.1}" width="${L * 0.16}" height="${body * 0.8}" rx="${body * 0.2}" fill="${C.glass}"/>
      <rect x="${L * 0.3}" y="${top + body * 0.12}" width="${L * 0.25}" height="${body * 0.76}" rx="${body * 0.2}" fill="${C.carRoof}"/>
      <rect x="${L * 0.17}" y="${top + body * 0.16}" width="${L * 0.12}" height="${body * 0.68}" rx="${body * 0.16}" fill="${C.glass}"/>
      <rect x="${L * 0.9}" y="${top + body * 0.1}" width="${L * 0.07}" height="${body * 0.22}" rx="${body * 0.1}" fill="#FFF6C8"/>
      <rect x="${L * 0.9}" y="${top + body * 0.68}" width="${L * 0.07}" height="${body * 0.22}" rx="${body * 0.1}" fill="#FFF6C8"/>
    </g>`;

  const clip = rounded ? `<clipPath id="r"><rect width="${size}" height="${size}" rx="${size * 0.22}"/></clipPath>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>${clip}</defs>
  <g ${rounded ? 'clip-path="url(#r)"' : ""}>
    ${tiles.join("")}
    ${house(s * 3.2, s * 0.2, s * 0.6, s * 0.5, C.roofA)}
    ${house(s * 0.22, s * 2.3, s * 0.55, s * 0.62, C.roofB)}
    ${tree(s * 0.5, s * 0.5, s * 0.24)}
    ${tree(s * 3.45, s * 2.6, s * 0.22)}
    ${tree(s * 3.3, s * 3.45, s * 0.26)}
    ${tree(s * 1.45, s * 3.4, s * 0.2)}
    <path d="${centre}" stroke="${C.kerbDark}" stroke-width="${span + 6}" fill="none"/>
    <path d="${centre}" stroke="${C.kerb}" stroke-width="${span}" fill="none"/>
    <path d="${centre}" stroke="${C.asphaltEdge}" stroke-width="${road + 0.025 * s}" fill="none"/>
    <path d="${centre}" stroke="${C.asphalt}" stroke-width="${road}" fill="none"/>
    <path d="${offsetPath(edgeOff)}" stroke="${C.edgeLine}" stroke-width="${0.022 * s}" fill="none" opacity="0.85"/>
    <path d="${offsetPath(-edgeOff)}" stroke="${C.edgeLine}" stroke-width="${0.022 * s}" fill="none" opacity="0.85"/>
    <path d="${centre}" stroke="${C.roadLine}" stroke-width="${0.04 * s}" stroke-dasharray="${0.16 * s} ${0.12 * s}" fill="none"/>
    ${car}
  </g>
</svg>`;
}

/** The splash mark: the roundabout emblem over the wordmark, on transparent. */
function splashSvg() {
  const w = 1200;
  const h = 900;
  const cx = w / 2;
  const cy = 300;
  const R = 210;
  const ring = R * 0.42;
  const word = (text: string, y: number, size: number, fill: string) => {
    const k = size * 0.08;
    const common = `x="${cx}" y="${y}" font-family="Fredoka" font-weight="700" font-size="${size}" text-anchor="middle"`;
    return `<text ${common} dy="${size * 0.09}" fill="${C.ink}" stroke="${C.ink}" stroke-width="${k * 2}" stroke-linejoin="round">${text}</text>
      <text ${common} fill="${fill}" stroke="${C.ink}" stroke-width="${k * 2}" stroke-linejoin="round" paint-order="stroke">${text}</text>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <circle cx="${cx}" cy="${cy + 16}" r="${R + 14}" fill="${C.ink}"/>
  <circle cx="${cx}" cy="${cy}" r="${R + 14}" fill="${C.ink}"/>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="${C.kerb}"/>
  <circle cx="${cx}" cy="${cy}" r="${R - 14}" fill="${C.asphalt}"/>
  <circle cx="${cx}" cy="${cy}" r="${R - 14 - ring}" fill="${C.kerb}"/>
  <circle cx="${cx}" cy="${cy}" r="${R - 26 - ring}" fill="${C.lawnA}"/>
  <circle cx="${cx}" cy="${cy}" r="${R - 14 - ring / 2}" stroke="${C.roadLine}" stroke-width="10" stroke-dasharray="26 22" fill="none"/>
  <circle cx="${cx}" cy="${cy}" r="48" fill="${C.bush}"/>
  <circle cx="${cx - 14}" cy="${cy - 14}" r="26" fill="${C.bushLight}"/>
  ${word("CONNECT", 640, 110, C.gold)}
  ${word("ROADS", 810, 170, C.orange)}
</svg>`;
}

function render(svg: string, width: number) {
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: "Fredoka" },
  });
  return r.render().asPng();
}

mkdirSync(OUT, { recursive: true });
const outputs: [string, Buffer][] = [
  ["icon.png", render(iconSvg(1024), 1024)],
  ["adaptive-icon.png", render(iconSvg(1024), 1024)],
  ["splash-icon.png", render(splashSvg(), 600)],
  ["favicon.png", render(iconSvg(1024, true), 64)],
];
for (const [name, png] of outputs) {
  writeFileSync(join(OUT, name), png);
  console.log(`  ${name.padEnd(18)} ${(png.length / 1024).toFixed(1).padStart(7)} kB`);
}
