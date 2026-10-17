// Multi-Asset Screener (SCRN)
// Institutional screener supporting Crypto, Forex, ETFs, and Equities
// with bounded error handling, provider status transparency, and sorting/filtering.
import * as providers from "../providers.js";

export const FX_PAIRS = [
  "FX:EURUSD", "FX:GBPUSD", "FX:USDJPY", "FX:USDCHF",
  "FX:AUDUSD", "FX:USDCAD", "FX:NZDUSD", "FX:EURGBP",
  "FX:EURJPY", "FX:GBPJPY", "FX:EURCHF", "FX:AUDJPY",
];

let customCryptoProvider = null;
let customForexProvider = null;
let customNasdaqProvider = null;

export function setScreenerProviders({ crypto, forex, nasdaq } = {}) {
  if (crypto !== undefined) customCryptoProvider = crypto;
  if (forex !== undefined) customForexProvider = forex;
  if (nasdaq !== undefined) customNasdaqProvider = nasdaq;
}

export async function fetchForexUniverse() {
  const quotes = await providers.getQuotes(FX_PAIRS);
  return FX_PAIRS.map((sym) => {
    const pair = sym.replace(/^FX:/, "");
    const q = quotes[sym] || {};
    const price = typeof q.price === "number" ? q.price : 0;
    const changePct = typeof q.changePct === "number" ? q.changePct : 0;
    const isJpy = pair.includes("JPY");
    const pipScale = isJpy ? 100 : 10000;
    const pips = price && changePct ? ((price * (changePct / 100)) * pipScale) : 0;

    return {
      symbol: sym,
      ticker: `${pair.slice(0, 3)}/${pair.slice(3)}`,
      name: `${pair.slice(0, 3)} to ${pair.slice(3)}`,
      price,
      changePct,
      pips: Number(pips.toFixed(1)),
      volume: q.volume || 0,
      sector: "Forex",
    };
  });
}

export default async function (params = {}) {
  const universe = String(params.universe || params.asset || "crypto").toLowerCase().trim();
  let rawRows = [];
  let source = "";
  let providerStatus = "OK";
  const timestamp = new Date().toISOString();

  try {
    if (universe === "crypto") {
      rawRows = customCryptoProvider ? await customCryptoProvider() : await providers.cryptoScreener();
      source = "Binance 24hr ticker feed (fallback to Kraken)";
    } else if (universe === "forex" || universe === "fx") {
      rawRows = customForexProvider ? await customForexProvider() : await fetchForexUniverse();
      source = "Public institutional Forex feeds (Yahoo Finance & Kraken)";
    } else if (universe === "etf") {
      rawRows = customNasdaqProvider ? await customNasdaqProvider("etf") : await providers.nasdaqScreener("etf");
      source = "Nasdaq Global Market Data & ETF Directory";
    } else {
      // Equities / stocks
      rawRows = customNasdaqProvider ? await customNasdaqProvider("stocks") : await providers.nasdaqScreener("stocks");
      source = "Nasdaq Real-Time Screener Feed";
    }
  } catch (err) {
    providerStatus = "UNAVAILABLE";
    source = `Provider unavailable (${err.message})`;
    rawRows = [];
  }

  // Ensure rawRows is an array
  if (!Array.isArray(rawRows)) {
    rawRows = [];
  }

  // Filter criteria
  const qSearch = String(params.q || "").toUpperCase().trim();
  const minPrice = params.minPrice != null && params.minPrice !== "" ? Number(params.minPrice) : -Infinity;
  const maxPrice = params.maxPrice != null && params.maxPrice !== "" ? Number(params.maxPrice) : Infinity;
  const minChange = params.minChange != null && params.minChange !== "" ? Number(params.minChange) : -Infinity;
  const maxChange = params.maxChange != null && params.maxChange !== "" ? Number(params.maxChange) : Infinity;
  const minVolume = params.minVolume != null && params.minVolume !== "" ? Number(params.minVolume) : 0;

  let filtered = rawRows.filter((r) => {
    if (qSearch) {
      const match = String(r.ticker || "").toUpperCase().includes(qSearch) ||
                    String(r.name || "").toUpperCase().includes(qSearch) ||
                    String(r.symbol || "").toUpperCase().includes(qSearch);
      if (!match) return false;
    }
    const px = Number(r.price) || 0;
    if (px < minPrice || px > maxPrice) return false;

    const chg = Number(r.changePct) || 0;
    if (chg < minChange || chg > maxChange) return false;

    const vol = Number(r.volume) || 0;
    if (vol < minVolume) return false;

    return true;
  });

  // Sorting
  const sortKey = params.sort || "changePct";
  const sortDir = (params.dir || (sortKey === "ticker" || sortKey === "name" ? "asc" : "desc")).toLowerCase();
  const mult = sortDir === "asc" ? 1 : -1;

  filtered.sort((a, b) => {
    const valA = a[sortKey];
    const valB = b[sortKey];
    if (typeof valA === "string") {
      return mult * String(valA).localeCompare(String(valB));
    }
    return mult * ((Number(valA) || 0) - (Number(valB) || 0));
  });

  // Summary statistics
  const gainers = filtered.filter((r) => (Number(r.changePct) || 0) > 0).length;
  const losers = filtered.filter((r) => (Number(r.changePct) || 0) < 0).length;
  const totalVol = filtered.reduce((acc, r) => acc + (Number(r.volume) || 0), 0);

  return {
    universe,
    status: providerStatus,
    timestamp,
    total: filtered.length,
    universeTotal: rawRows.length,
    gainers,
    losers,
    totalVolume: totalVol,
    rows: filtered.slice(0, 150),
    source: `${source} · Tavoryn Screener Engine`,
  };
}
