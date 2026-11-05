import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// High-DPI Close-up Crops from 1920x1080 Terminal Views
// Target size: 640x360 (16:9 ratio, razor-sharp on Retina/4K displays)
const CROPS = [
  {
    name: "card-crop-research",
    // Focus on FA stock chart + green volume bars + valuation metrics from bb-company.webp
    src: "public/screenshots/bb-company.webp",
    fallbackSrc: "public/manual/assets/financial-analysis-fa.png",
    crop: "crop=700:390:600:150",
  },
  {
    name: "card-crop-news",
    // Focus on live news wire headlines & macro calendar from bb-news.webp
    src: "public/screenshots/bb-news.webp",
    fallbackSrc: "public/manual/assets/economic-calendar-eco.png",
    crop: "crop=700:390:100:140",
  },
  {
    name: "card-crop-access",
    // Focus on WEI World Equities board with green % gains and red % losses from bb-markets.webp
    src: "public/screenshots/bb-markets.webp",
    fallbackSrc: "public/manual/assets/world-markets-wei.png",
    crop: "crop=700:390:20:120",
  },
  {
    name: "card-crop-charts",
    // Focus on multi-pane candlestick chart with red/green candles and volume from bb-panels.webp
    src: "public/screenshots/bb-panels.webp",
    fallbackSrc: "public/manual/assets/chart-technical-analysis-gp.png",
    crop: "crop=700:390:300:180",
  },
  {
    name: "card-crop-collaboration",
    // Focus on multi-monitor 4-quadrant layout from bb-workspace.webp
    src: "public/screenshots/bb-workspace.webp",
    fallbackSrc: "public/manual/assets/dashboard-workspace-overview.png",
    crop: "crop=700:390:250:120",
  },
  {
    name: "card-crop-education",
    // Focus on AI financial assistant & quantitative formula from bb-ask.webp
    src: "public/screenshots/bb-ask.webp",
    fallbackSrc: "public/manual/assets/ai-research-assistant-ask.png",
    crop: "crop=700:390:200:140",
  },
  {
    name: "card-crop-portfolio",
    // Focus on options chain strikes and Greeks matrix from bb-omon.webp
    src: "public/screenshots/bb-omon.webp",
    fallbackSrc: "public/manual/assets/options-chain-omon.png",
    crop: "crop=700:390:100:150",
  },
];

for (const c of CROPS) {
  const inputFile = fs.existsSync(c.src) ? c.src : c.fallbackSrc;
  const outWebp = path.join("public/screenshots", `${c.name}.webp`);
  const outPng = path.join("public/screenshots", `${c.name}.png`);

  console.log(`Generating ${c.name} from ${inputFile}...`);
  // Generate high-quality WebP
  execSync(`ffmpeg -y -i "${inputFile}" -vf "${c.crop}" -quality 95 "${outWebp}"`, { stdio: "pipe" });
  // Generate high-quality PNG
  execSync(`ffmpeg -y -i "${inputFile}" -vf "${c.crop}" "${outPng}"`, { stdio: "pipe" });
}

console.log("All 7 high-DPI crops generated successfully.");
