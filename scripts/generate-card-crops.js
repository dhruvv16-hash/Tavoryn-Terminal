import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Clean, Perfectly-Framed High-DPI Crops from 1400x900 Assets
// Bypasses the top amber window header to eliminate cut-off header strips.
// Centers directly on the live data, candlesticks, and quantitative tables.
const CROPS = [
  {
    name: "card-crop-research",
    // Focus cleanly on DCF Valuation Model intrinsic value & sensitivity matrix
    src: "public/manual/assets/dcf-valuation-model.png",
    crop: "crop=560:310:30:130",
  },
  {
    name: "card-crop-news",
    // Focus cleanly on Macro Economic Calendar events and consensus prints
    src: "public/manual/assets/economic-calendar-eco.png",
    crop: "crop=560:310:20:130",
  },
  {
    name: "card-crop-access",
    // Focus cleanly on WEI World Equities Board benchmark indices
    src: "public/manual/assets/world-markets-wei.png",
    crop: "crop=560:310:20:130",
  },
  {
    name: "card-crop-charts",
    // Focus directly on the glowing green/red candlesticks and moving average lines
    src: "public/manual/assets/chart-technical-analysis-gp.png",
    crop: "crop=560:310:240:180",
  },
  {
    name: "card-crop-collaboration",
    // Focus cleanly on the 4-quadrant multi-panel workstation layout
    src: "public/manual/assets/dashboard-workspace-overview.png",
    crop: "crop=560:310:140:120",
  },
  {
    name: "card-crop-education",
    // Focus cleanly on AI Research Desk query & formula breakdown
    src: "public/manual/assets/ai-research-assistant-ask.png",
    crop: "crop=560:310:40:135",
  },
  {
    name: "card-crop-portfolio",
    // Focus cleanly on Crisis Lab macroeconomic scenario drawdown bars
    src: "public/manual/assets/portfolio-stress-testing.png",
    crop: "crop=560:310:20:135",
  },
];

for (const c of CROPS) {
  const inputFile = c.src;
  const outWebp = path.join("public/screenshots", `${c.name}.webp`);
  const outPng = path.join("public/screenshots", `${c.name}.png`);

  console.log(`Generating clean crop for ${c.name}...`);
  execSync(
    `ffmpeg -y -i "${inputFile}" -vf "${c.crop},unsharp=5:5:0.8:3:3:0.0,eq=contrast=1.08:brightness=0.02" -quality 98 "${outWebp}"`,
    { stdio: "pipe" }
  );
  execSync(
    `ffmpeg -y -i "${inputFile}" -vf "${c.crop},unsharp=5:5:0.8:3:3:0.0,eq=contrast=1.08:brightness=0.02" "${outPng}"`,
    { stdio: "pipe" }
  );
}

console.log("All 7 clean crops successfully updated.");
