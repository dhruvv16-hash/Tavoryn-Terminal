// Historical Data Interface & Integrity Validator
// Enforces strict schema, chronological ordering, positive finite prices,
// OHLC geometric invariants, volume bounds, gap detection, and cryptographic provenance.
// Never silently fabricates historical prices.

import crypto from "node:crypto";
import { parseTf } from "../public/lib/series.js";

const EPSILON = 1e-7;

/**
 * Normalizes a raw bar into canonical format:
 * { time, isoTime, symbol, open, high, low, close, volume, timeframe, provenance }
 */
export function normalizeBar(raw, options = {}) {
  if (!raw || typeof raw !== "object") {
    throw new TypeError("Bar must be an object");
  }

  // 1. Timestamp resolution (seconds UTC)
  let rawTime = raw.time ?? raw.timestamp ?? raw.t ?? raw.date;
  if (rawTime == null) {
    throw new Error("Bar missing timestamp (must have time, timestamp, or date)");
  }

  let sec;
  if (typeof rawTime === "string") {
    const parsed = Date.parse(rawTime);
    if (Number.isNaN(parsed)) {
      const num = Number(rawTime);
      if (!Number.isFinite(num)) throw new Error(`Invalid timestamp string: "${rawTime}"`);
      sec = num > 1e11 ? Math.floor(num / 1000) : Math.floor(num);
    } else {
      sec = Math.floor(parsed / 1000);
    }
  } else if (typeof rawTime === "number") {
    if (!Number.isFinite(rawTime) || rawTime <= 0) {
      throw new Error(`Invalid numeric timestamp: ${rawTime}`);
    }
    sec = rawTime > 1e11 ? Math.floor(rawTime / 1000) : Math.floor(rawTime);
  } else if (rawTime instanceof Date) {
    sec = Math.floor(rawTime.getTime() / 1000);
  } else {
    throw new Error(`Unsupported timestamp format: ${typeof rawTime}`);
  }

  const isoTime = new Date(sec * 1000).toISOString();

  // 2. Price fields (finite positive numbers)
  const o = Number(raw.open ?? raw.o);
  const h = Number(raw.high ?? raw.h);
  const l = Number(raw.low ?? raw.l);
  const c = Number(raw.close ?? raw.c);

  if (!Number.isFinite(o) || o <= 0) throw new Error(`Invalid open price at ${isoTime}: ${o}`);
  if (!Number.isFinite(h) || h <= 0) throw new Error(`Invalid high price at ${isoTime}: ${h}`);
  if (!Number.isFinite(l) || l <= 0) throw new Error(`Invalid low price at ${isoTime}: ${l}`);
  if (!Number.isFinite(c) || c <= 0) throw new Error(`Invalid close price at ${isoTime}: ${c}`);

  // 3. Volume (finite, >= 0)
  const rawVol = raw.volume ?? raw.vol ?? raw.v ?? 0;
  const v = Number(rawVol);
  if (!Number.isFinite(v) || v < 0) {
    throw new Error(`Invalid volume at ${isoTime}: ${rawVol}`);
  }

  const symbol = String(raw.symbol || options.symbol || "UNKNOWN").toUpperCase().trim();
  const timeframe = String(raw.timeframe || options.timeframe || "1D").trim();
  const provenance = raw.provenance || options.provenance || options.source || "market-data";

  return {
    time: sec,
    isoTime,
    symbol,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
    timeframe,
    provenance,
  };
}

/**
 * Computes deterministic SHA-256 digest of historical bars
 */
export function computeBarsHash(bars) {
  const hash = crypto.createHash("sha256");
  for (const b of bars) {
    hash.update(`${b.time},${b.open},${b.high},${b.low},${b.close},${b.volume};`);
  }
  return hash.digest("hex");
}

/**
 * Validates an array of historical bars against institutional integrity invariants:
 * - Chronological ordering (time[i] > time[i-1])
 * - Absence of duplicate timestamps
 * - Geometric OHLC integrity: high >= max(open, close, low), low <= min(open, close, high)
 * - Positive finite prices and non-negative volume
 * - Explicit gap detection (never silently fabricates bars)
 */
export function validateHistoricalBars(bars, options = {}) {
  if (!Array.isArray(bars)) {
    throw new TypeError("Historical bars must be an array");
  }
  if (bars.length === 0) {
    throw new Error("Historical bars array cannot be empty");
  }

  const normalized = new Array(bars.length);
  for (let i = 0; i < bars.length; i++) {
    const b = normalizeBar(bars[i], options);

    if (i > 0) {
      const prev = normalized[i - 1];
      if (b.time === prev.time) {
        throw new Error(
          `Duplicate timestamp detected at index ${i} (${b.isoTime}): multiple bars share time ${b.time}`,
        );
      }
      if (b.time < prev.time) {
        throw new Error(
          `Non-chronological order at index ${i}: bar timestamp ${b.time} (${b.isoTime}) is earlier than previous bar ${prev.time} (${prev.isoTime})`,
        );
      }
    }

    // Invariant: high >= max(open, close, low) with tolerance
    if (b.high < b.open - EPSILON || b.high < b.close - EPSILON || b.high < b.low - EPSILON) {
      throw new Error(
        `Invalid OHLC relationship at index ${i} (${b.isoTime}): high (${b.high}) must be >= open (${b.open}), close (${b.close}), and low (${b.low})`,
      );
    }

    // Invariant: low <= min(open, close, high) with tolerance
    if (b.low > b.open + EPSILON || b.low > b.close + EPSILON || b.low > b.high + EPSILON) {
      throw new Error(
        `Invalid OHLC relationship at index ${i} (${b.isoTime}): low (${b.low}) must be <= open (${b.open}), close (${b.close}), and high (${b.high})`,
      );
    }

    normalized[i] = b;
  }

  // Gap detection
  let expectedStep = options.expectedIntervalSeconds;
  if (!expectedStep && options.timeframe) {
    try {
      expectedStep = parseTf(options.timeframe).seconds;
    } catch {}
  }

  if (!expectedStep && normalized.length > 2) {
    // Infer median interval
    const deltas = [];
    for (let i = 1; i < Math.min(normalized.length, 50); i++) {
      deltas.push(normalized[i].time - normalized[i - 1].time);
    }
    deltas.sort((a, b) => a - b);
    expectedStep = deltas[Math.floor(deltas.length / 2)];
  }

  const gaps = [];
  if (expectedStep && expectedStep > 0 && normalized.length > 1) {
    // Multiplier: 3.5 for daily bars (to avoid flagging ordinary weekend gaps), 1.8 for intraday
    const thresholdMult = options.gapThresholdMultiplier ?? (expectedStep >= 86400 ? 3.5 : 1.8);
    const threshold = expectedStep * thresholdMult;

    for (let i = 1; i < normalized.length; i++) {
      const delta = normalized[i].time - normalized[i - 1].time;
      if (delta > threshold) {
        gaps.push({
          index: i,
          fromTime: normalized[i - 1].time,
          toTime: normalized[i].time,
          fromIso: normalized[i - 1].isoTime,
          toIso: normalized[i].isoTime,
          deltaSeconds: delta,
          missingBarsApprox: Math.max(1, Math.round(delta / expectedStep) - 1),
        });
      }
    }
  }

  if (options.strictNoGaps && gaps.length > 0) {
    throw new Error(
      `Historical data validation failed: ${gaps.length} gaps detected, first gap between ${gaps[0].fromIso} and ${gaps[0].toIso} (${gaps[0].missingBarsApprox} missing bars)`,
    );
  }

  const sha256 = computeBarsHash(normalized);
  const provenance = {
    source: options.source || normalized[0].provenance || "historical-data",
    provider: options.provider || "tavoryn-terminal",
    checksum: sha256,
    verifiedAt: new Date().toISOString(),
  };

  return {
    valid: true,
    count: normalized.length,
    symbol: normalized[0].symbol,
    timeframe: normalized[0].timeframe,
    from: normalized[0].time,
    to: normalized[normalized.length - 1].time,
    fromIso: normalized[0].isoTime,
    toIso: normalized[normalized.length - 1].isoTime,
    sha256,
    gaps,
    provenance,
    bars: normalized,
  };
}
