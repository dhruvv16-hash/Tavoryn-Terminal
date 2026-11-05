import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Ultra-High-DPI Razor-Sharp Close-up Crops from 1400x900 Lossless Source Assets
// Target aspect ratio ~ 1.8:1 (560x310), sharpened and contrast-enhanced for maximum crispness
const CROPS = [
  {
    name: "card-crop-research",
    // Focus on DCF Valuation Model intrinsic value + sensitivity matrix
    src: "public/manual/assets/dcf-valuation-model.png",
    crop: "crop=560:310:20:90",
  },
  {
    name: "card-crop-news",
    // Focus on Economic Calendar indicators + high impact badges
    src: "public/manual/assets/economic-calendar-eco.png",
    crop: "crop=560:310:20:90",
  },
  {
    name: "card-crop-access",
    // Focus on WEI World Equities Board benchmark indices + green/red changes
    src: "public/manual/assets/world-markets-wei.png",
    crop: "crop=560:310:15:90",
  },
  {
    name: "card-crop-charts",
    // Focus on Candlestick price chart with green/red candles and moving average ribbons
    src: "public/manual/assets/chart-technical-analysis-gp.png",
    crop: "crop=560:310:230:130",
  },
  {
    name: "card-crop-collaboration",
    // Focus on multi-pane synchronized workstation quadrant panels
    src: "public/manual/assets/dashboard-workspace-overview.png",
    crop: "crop=560:310:120:70",
  },
  {
    name: "card-crop-education",
    // Focus on AI Financial Assistant with natural language prompt + formula breakdown
    src: "public/manual/assets/ai-research-assistant-ask.png",
    crop: "crop=560:310:35:95",
  },
  {
    name: "card-crop-portfolio",
    // Focus on Crisis Lab historical scenario shocks with drawdown bars
    src: "public/manual/assets/portfolio-stress-testing.png",
    crop: "crop=560:310:20:100",
  },
];

for (const c of CROPS) {
  const inputFile = c.src;
  const outWebp = path.join("public/screenshots", `${c.name}.webp`);
  const outPng = path.join("public/screenshots", `${c.name}.png`);

  console.log(`Generating crystal-clear crop for ${c.name} from ${inputFile}...`);
  // Generate ultra-crisp WebP with unsharp sharpening & contrast enhancement
  execSync(
    `ffmpeg -y -i "${inputFile}" -vf "${c.crop},unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.12:brightness=0.03" -quality 98 "${outWebp}"`,
    { stdio: "pipe" }
  );
  // Generate PNG fallback
  execSync(
    `ffmpeg -y -i "${inputFile}" -vf "${c.crop},unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.12:brightness=0.03" "${outPng}"`,
    { stdio: "pipe" }
  );
}

console.log("All 7 ultra-high-DPI crops generated successfully.");
