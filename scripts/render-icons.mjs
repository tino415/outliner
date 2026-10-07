import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync("public/icons/icon.svg", "utf8");
const fullBleed = svg.replace('rx="116"', 'rx="0"');
const maskable = fullBleed.replace(
  /(<rect width="512" height="512" rx="0" fill="#23262c"\/>)([\s\S]*)(<\/svg>)/,
  '$1<g transform="translate(51.2 51.2) scale(0.8)">$2</g>$3',
);

const outputs = [
  { file: "public/icons/icon-192.png", size: 192, source: svg, transparent: true },
  { file: "public/icons/icon-512.png", size: 512, source: svg, transparent: true },
  { file: "public/icons/maskable-512.png", size: 512, source: maskable, transparent: false },
  { file: "public/icons/apple-touch-icon.png", size: 180, source: fullBleed, transparent: false },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, source, transparent } of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${source}`,
  );
  await page.screenshot({ path: file, omitBackground: transparent });
  console.log("wrote", file);
}
await browser.close();
