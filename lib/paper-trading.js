// Paper Trading & Order Execution Engine
// Institutional accounting: cash, reservations, positions, realized/unrealized P&L,
// and concurrency-safe serialized execution queue.
import fs from "node:fs";
import path from "node:path";
import * as store from "./store.js";
import * as providers from "./providers.js";

const DEFAULT_STARTING_CASH = 100000.0;
function getStoreKey() {
  return (
    process.env.TAVORYN_PAPER_STORE_KEY ||
    process.env.AMBER_PAPER_STORE_KEY ||
    "paper-account"
  );
}

let customQuoteResolver = null;
export function setQuoteResolver(resolver) {
  customQuoteResolver = resolver;
}

// Execution mutex queue ensuring concurrent orders are strictly serialized
let execQueue = Promise.resolve();
export function runLocked(fn) {
  const next = execQueue.then(fn, fn);
  execQueue = next.catch(() => {});
  return next;
}

export function getAccount() {
  const storeKey = getStoreKey();
  const filePath = path.join(store.DATA_DIR, `${storeKey}.json`);
  let acc = null;
  let fileExisted = false;

  try {
    if (fs.existsSync(filePath)) {
      fileExisted = true;
      const raw = fs.readFileSync(filePath, "utf8");
      acc = JSON.parse(raw);
    }
  } catch {
    // Corrupted file on disk: quarantine to preserve salvageable data before resetting
    try {
      const corruptBackup = path.join(store.DATA_DIR, `${storeKey}.corrupted.${Date.now()}.json`);
      fs.copyFileSync(filePath, corruptBackup);
    } catch {}
    acc = null;
  }

  if (acc && typeof acc.cash === "number" && Number.isFinite(acc.cash)) {
    if (typeof acc.reservedCash !== "number" || !Number.isFinite(acc.reservedCash)) acc.reservedCash = 0;
    if (typeof acc.realizedPnl !== "number" || !Number.isFinite(acc.realizedPnl)) acc.realizedPnl = 0;
    if (typeof acc.totalFees !== "number" || !Number.isFinite(acc.totalFees)) acc.totalFees = 0;
    if (!acc.positions || typeof acc.positions !== "object") acc.positions = {};
    if (!Array.isArray(acc.orders)) acc.orders = [];
    if (!Array.isArray(acc.journal)) acc.journal = [];
    if (!acc.riskLimits || typeof acc.riskLimits !== "object") {
      acc.riskLimits = { maxOrderNotional: null, maxPositionNotional: null, maxDailyLoss: null };
    }
    return acc;
  }

  // If the file existed but had invalid schema (e.g. non-numeric cash), quarantine it as well
  if (fileExisted && acc !== null) {
    try {
      const corruptBackup = path.join(store.DATA_DIR, `${storeKey}.corrupted.${Date.now()}.json`);
      fs.copyFileSync(filePath, corruptBackup);
    } catch {}
  }

  const initial = {
    cash: DEFAULT_STARTING_CASH,
    reservedCash: 0,
    initialCash: DEFAULT_STARTING_CASH,
    realizedPnl: 0,
    totalFees: 0,
    positions: {},
    orders: [],
    journal: [],
    riskLimits: {
      maxOrderNotional: null,
      maxPositionNotional: null,
      maxDailyLoss: null,
    },
    updatedAt: new Date().toISOString(),
  };
  store.write(storeKey, initial);
  return initial;
}

export function saveAccount(acc) {
  acc.updatedAt = new Date().toISOString();
  store.write(getStoreKey(), acc);
  return acc;
}

export function resetAccount(startingCash = DEFAULT_STARTING_CASH) {
  return runLocked(async () => {
    const current = getAccount();
    const cash = Number(startingCash) > 0 ? Number(startingCash) : DEFAULT_STARTING_CASH;
    const fresh = {
      cash,
      reservedCash: 0,
      initialCash: cash,
      realizedPnl: 0,
      totalFees: 0,
      positions: {},
      orders: [],
      journal: [],
      riskLimits: current.riskLimits || {
        maxOrderNotional: null,
        maxPositionNotional: null,
        maxDailyLoss: null,
      },
      updatedAt: new Date().toISOString(),
    };
    return saveAccount(fresh);
  });
}

export function getRiskLimits() {
  const acc = getAccount();
  return acc.riskLimits || {
    maxOrderNotional: null,
    maxPositionNotional: null,
    maxDailyLoss: null,
  };
}

export function setRiskLimits(limits = {}) {
  return runLocked(async () => {
    const acc = getAccount();
    acc.riskLimits = {
      maxOrderNotional:
        limits.maxOrderNotional != null && Number(limits.maxOrderNotional) > 0
          ? Number(limits.maxOrderNotional)
          : null,
      maxPositionNotional:
        limits.maxPositionNotional != null && Number(limits.maxPositionNotional) > 0
          ? Number(limits.maxPositionNotional)
          : null,
      maxDailyLoss:
        limits.maxDailyLoss != null && Number(limits.maxDailyLoss) > 0
          ? Number(limits.maxDailyLoss)
          : null,
    };
    saveAccount(acc);
    return acc.riskLimits;
  });
}

export function setFeeModel({ feePerOrder = 0, feeBps = 0 } = {}) {
  return runLocked(async () => {
    const acc = getAccount();
    acc.feePerOrder = Math.max(0, Number(feePerOrder) || 0);
    acc.feeBps = Math.max(0, Number(feeBps) || 0);
    saveAccount(acc);
    return { feePerOrder: acc.feePerOrder, feeBps: acc.feeBps };
  });
}

export async function fetchCurrentPrice(symbol) {
  if (customQuoteResolver) {
    const custom = await customQuoteResolver(symbol);
    if (custom && typeof custom.price === "number" && Number.isFinite(custom.price) && custom.price > 0) {
      return custom;
    }
    return null;
  }
  try {
    const res = await providers.resolve(symbol);
    const quotes = await providers.getQuotes([res.id]);
    const q = quotes[res.id];
    if (q && typeof q.price === "number" && Number.isFinite(q.price) && q.price > 0 && !q.error) {
      return {
        id: res.id,
        ticker: res.ticker,
        name: res.name || res.ticker,
        price: q.price,
        source: q.source || "live",
        stale: Boolean(q.stale),
      };
    }
    const { candles } = await providers.getCandles(res.id, "1D", 2);
    if (candles?.length) {
      const last = candles[candles.length - 1];
      if (last && typeof last.close === "number" && Number.isFinite(last.close) && last.close > 0) {
        return {
          id: res.id,
          ticker: res.ticker,
          name: res.name || res.ticker,
          price: last.close,
          source: "candle-close",
          stale: true,
        };
      }
    }
  } catch {
    // Symbol resolution error or network failure
  }
  return null;
}

function clientError(msg) {
  return Object.assign(new Error(msg), { status: 400 });
}

export async function placeOrder({ symbol, side, type = "MARKET", qty, price = null }) {
  if (!symbol) throw clientError("Order requires a symbol (e.g. AAPL, BTC, EURUSD)");
  const cleanSide = String(side || "").toUpperCase().trim();
  if (cleanSide !== "BUY" && cleanSide !== "SELL") {
    throw clientError("Order side must be 'BUY' or 'SELL'");
  }
  const cleanType = String(type || "MARKET").toUpperCase().trim();
  if (cleanType !== "MARKET" && cleanType !== "LIMIT") {
    throw clientError("Order type must be 'MARKET' or 'LIMIT'");
  }
  const numQty = Number(qty);
  if (!Number.isFinite(numQty) || numQty <= 0) {
    throw clientError("Order quantity must be a positive number");
  }

  const limitPrice = price != null ? Number(price) : null;
  if (cleanType === "LIMIT" && (!Number.isFinite(limitPrice) || limitPrice <= 0)) {
    throw clientError("Limit orders require a positive price");
  }

  // Serialize quote fetch, order validation, and account mutation
  return runLocked(async () => {
    const quote = await fetchCurrentPrice(symbol);
    if (!quote || typeof quote.price !== "number" || !Number.isFinite(quote.price) || quote.price <= 0) {
      throw clientError(`Could not resolve market price for symbol '${symbol}'`);
    }

    const acc = getAccount();
    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;

    let shouldFillImmediately = false;
    let execPrice = quote.price;

    if (cleanType === "MARKET") {
      shouldFillImmediately = true;
      execPrice = quote.price;
    } else if (cleanType === "LIMIT") {
      if (cleanSide === "BUY" && quote.price <= limitPrice) {
        shouldFillImmediately = true;
        execPrice = Math.min(quote.price, limitPrice);
      } else if (cleanSide === "SELL" && quote.price >= limitPrice) {
        shouldFillImmediately = true;
        execPrice = Math.max(quote.price, limitPrice);
      }
    }

    const posKey = quote.id;
    const currentPos = acc.positions[posKey] || {
      symbol: quote.id,
      name: quote.name,
      qty: 0,
      avgPrice: 0,
      costBasis: 0,
      realizedPnl: 0,
    };

    const availableCash = Math.max(0, acc.cash - (acc.reservedCash || 0));

    // Calculate pending SELL reservations for this symbol to prevent double-selling
    const pendingSellQty = acc.orders
      .filter((o) => o.status === "PENDING" && o.side === "SELL" && o.symbol === posKey)
      .reduce((sum, o) => sum + o.qty, 0);
    const availableShares = Math.max(0, currentPos.qty - pendingSellQty);

    // Calculate order notional for risk controls
    const orderNotional = (cleanType === "LIMIT" && limitPrice && !shouldFillImmediately ? limitPrice : execPrice) * numQty;
    const limits = acc.riskLimits || {};

    // 1. Max Order Notional Limit
    if (limits.maxOrderNotional != null && orderNotional > limits.maxOrderNotional) {
      throw clientError(
        `Risk control rejection: Order notional $${orderNotional.toFixed(2)} exceeds maximum limit $${limits.maxOrderNotional.toFixed(2)}`,
      );
    }

    // 2. Max Position Notional Limit (on BUY orders)
    if (cleanSide === "BUY" && limits.maxPositionNotional != null) {
      const projectedCost = (currentPos.costBasis || 0) + (execPrice * numQty);
      if (projectedCost > limits.maxPositionNotional) {
        throw clientError(
          `Risk control rejection: Projected position notional $${projectedCost.toFixed(2)} exceeds maximum limit $${limits.maxPositionNotional.toFixed(2)}`,
        );
      }
    }

    // 3. Daily Loss Limit
    if (limits.maxDailyLoss != null) {
      const todayIso = new Date().toISOString().slice(0, 10);
      let todayRealizedLoss = 0;
      for (const entry of acc.journal) {
        if (entry.timestamp && entry.timestamp.startsWith(todayIso)) {
          if (entry.realizedPnl && entry.realizedPnl < 0) {
            todayRealizedLoss += Math.abs(entry.realizedPnl);
          }
        }
      }
      if (todayRealizedLoss >= limits.maxDailyLoss) {
        throw clientError(
          `Risk control rejection: Daily loss limit of $${limits.maxDailyLoss.toFixed(2)} has been reached for today ($${todayRealizedLoss.toFixed(2)} lost)`,
        );
      }
    }

    if (shouldFillImmediately) {
      const totalCost = execPrice * numQty;
      // Fee model: default 0, or configurable fee
      const feePerOrder = typeof acc.feePerOrder === "number" ? acc.feePerOrder : 0;
      const feeBps = typeof acc.feeBps === "number" ? acc.feeBps : 0;
      const fee = Number((feePerOrder + (totalCost * feeBps) / 10000).toFixed(2));

      if (cleanSide === "BUY") {
        if (availableCash < totalCost + fee) {
          throw clientError(
            `Insufficient funds: order requires $${(totalCost + fee).toFixed(2)}, available cash $${availableCash.toFixed(2)} (reserved: $${(acc.reservedCash || 0).toFixed(2)})`,
          );
        }
        acc.cash -= totalCost + fee;
        acc.totalFees = (acc.totalFees || 0) + fee;

        const newQty = currentPos.qty + numQty;
        const newCostBasis = currentPos.costBasis + totalCost;
        const newAvg = newCostBasis / newQty;

        acc.positions[posKey] = {
          symbol: quote.id,
          name: quote.name,
          qty: newQty,
          avgPrice: newAvg,
          costBasis: newCostBasis,
          realizedPnl: currentPos.realizedPnl || 0,
        };
      } else {
        // SELL (Long only cash account check with pending reservation check)
        if (availableShares < numQty) {
          throw clientError(
            `Insufficient position: you hold ${currentPos.qty} of ${quote.ticker}${pendingSellQty > 0 ? ` (${pendingSellQty} reserved in pending limit orders)` : ""}, cannot sell ${numQty}`,
          );
        }
        const proceeds = execPrice * numQty;
        const costSold = currentPos.avgPrice * numQty;
        const realized = proceeds - costSold - fee;

        acc.cash += proceeds - fee;
        acc.realizedPnl = (acc.realizedPnl || 0) + realized;
        acc.totalFees = (acc.totalFees || 0) + fee;

        const remainingQty = currentPos.qty - numQty;
        if (remainingQty <= 0.000001) {
          delete acc.positions[posKey];
        } else {
          const remainingCostBasis = remainingQty * currentPos.avgPrice;
          acc.positions[posKey] = {
            symbol: quote.id,
            name: quote.name,
            qty: remainingQty,
            avgPrice: currentPos.avgPrice,
            costBasis: remainingCostBasis,
            realizedPnl: (currentPos.realizedPnl || 0) + realized,
          };
        }
      }

      const orderRecord = {
        id: orderId,
        symbol: quote.id,
        name: quote.name,
        side: cleanSide,
        type: cleanType,
        qty: numQty,
        limitPrice,
        execPrice,
        status: "FILLED",
        fee,
        filledAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      acc.orders.unshift(orderRecord);
      acc.journal.unshift({
        id: `TX-${orderId}`,
        orderId,
        symbol: quote.id,
        side: cleanSide,
        qty: numQty,
        price: execPrice,
        value: cleanSide === "BUY" ? totalCost : execPrice * numQty,
        realizedPnl: cleanSide === "SELL" ? (execPrice * numQty - currentPos.avgPrice * numQty - fee) : 0,
        fee,
        timestamp: new Date().toISOString(),
      });
      saveAccount(acc);
      return { ok: true, status: "FILLED", order: orderRecord };
    } else {
      // PENDING LIMIT ORDER
      if (cleanSide === "BUY") {
        const requiredReserve = limitPrice * numQty;
        if (availableCash < requiredReserve) {
          throw clientError(
            `Insufficient funds to reserve pending limit order: requires $${requiredReserve.toFixed(2)}, available cash $${availableCash.toFixed(2)} (already reserved: $${(acc.reservedCash || 0).toFixed(2)})`,
          );
        }
        acc.reservedCash = (acc.reservedCash || 0) + requiredReserve;
      } else {
        // PENDING LIMIT SELL: check available unreserved shares
        if (availableShares < numQty) {
          throw clientError(
            `Insufficient position to place pending sell order: you hold ${currentPos.qty} of ${quote.ticker}${pendingSellQty > 0 ? ` (${pendingSellQty} reserved in pending limit orders)` : ""}, cannot sell ${numQty}`,
          );
        }
      }

      const orderRecord = {
        id: orderId,
        symbol: quote.id,
        name: quote.name,
        side: cleanSide,
        type: cleanType,
        qty: numQty,
        limitPrice,
        execPrice: null,
        reservedAmount: cleanSide === "BUY" ? limitPrice * numQty : 0,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      };
      acc.orders.unshift(orderRecord);
      saveAccount(acc);
      return { ok: true, status: "PENDING", order: orderRecord };
    }
  });
}

export function cancelOrder(orderId) {
  return runLocked(async () => {
    const acc = getAccount();
    const ord = acc.orders.find((o) => o.id === orderId);
    if (!ord) throw clientError(`Order ${orderId} not found`);
    if (ord.status !== "PENDING") throw clientError(`Cannot cancel order in status '${ord.status}'`);

    ord.status = "CANCELLED";
    ord.cancelledAt = new Date().toISOString();

    if (ord.side === "BUY" && ord.reservedAmount > 0) {
      acc.reservedCash = Math.max(0, (acc.reservedCash || 0) - ord.reservedAmount);
      ord.reservedAmount = 0;
    }
    saveAccount(acc);
    return { ok: true, order: ord };
  });
}

export async function syncAndValuate() {
  return runLocked(async () => {
    const acc = getAccount();
    const posSymbols = Object.keys(acc.positions);
    const pendingOrders = acc.orders.filter((o) => o.status === "PENDING");
    const allSymbols = [...new Set([...posSymbols, ...pendingOrders.map((o) => o.symbol)])];

    let quotes = {};
    if (allSymbols.length) {
      if (customQuoteResolver) {
        for (const s of allSymbols) {
          const q = await customQuoteResolver(s);
          if (q) quotes[q.id || s] = q;
        }
      } else {
        try {
          quotes = await providers.getQuotes(allSymbols);
        } catch {}
      }
    }

    // Check pending limit orders for execution
    let stateModified = false;
    for (const ord of pendingOrders) {
      const q = quotes[ord.symbol];
      if (!q || !(q.price > 0)) continue;

      let canFill = false;
      let fillPrice = ord.limitPrice;
      if (ord.side === "BUY" && q.price <= ord.limitPrice) {
        canFill = true;
        fillPrice = Math.min(q.price, ord.limitPrice);
      } else if (ord.side === "SELL" && q.price >= ord.limitPrice) {
        canFill = true;
        fillPrice = Math.max(q.price, ord.limitPrice);
      }

      if (canFill) {
        const posKey = ord.symbol;
        const currentPos = acc.positions[posKey] || {
          symbol: ord.symbol,
          name: ord.name,
          qty: 0,
          avgPrice: 0,
          costBasis: 0,
          realizedPnl: 0,
        };
        const totalCost = fillPrice * ord.qty;

        if (ord.side === "BUY") {
          // Release reservation
          const reserved = ord.reservedAmount || (ord.limitPrice * ord.qty);
          acc.reservedCash = Math.max(0, (acc.reservedCash || 0) - reserved);
          ord.reservedAmount = 0;

          acc.cash -= totalCost;
          const newQty = currentPos.qty + ord.qty;
          const newCostBasis = currentPos.costBasis + totalCost;
          const newAvg = newCostBasis / newQty;

          acc.positions[posKey] = {
            symbol: ord.symbol,
            name: ord.name,
            qty: newQty,
            avgPrice: newAvg,
            costBasis: newCostBasis,
            realizedPnl: currentPos.realizedPnl || 0,
          };
          ord.status = "FILLED";
          ord.execPrice = fillPrice;
          ord.filledAt = new Date().toISOString();
          acc.journal.unshift({
            id: `TX-${ord.id}`,
            orderId: ord.id,
            symbol: ord.symbol,
            side: ord.side,
            qty: ord.qty,
            price: fillPrice,
            value: totalCost,
            realizedPnl: 0,
            fee: 0,
            timestamp: new Date().toISOString(),
          });
          stateModified = true;
        } else if (ord.side === "SELL" && currentPos.qty >= ord.qty) {
          const proceeds = fillPrice * ord.qty;
          const costSold = currentPos.avgPrice * ord.qty;
          const realized = proceeds - costSold;

          acc.cash += proceeds;
          acc.realizedPnl = (acc.realizedPnl || 0) + realized;

          const remainingQty = currentPos.qty - ord.qty;
          if (remainingQty <= 0.000001) {
            delete acc.positions[posKey];
          } else {
            acc.positions[posKey] = {
              symbol: ord.symbol,
              name: ord.name,
              qty: remainingQty,
              avgPrice: currentPos.avgPrice,
              costBasis: remainingQty * currentPos.avgPrice,
              realizedPnl: (currentPos.realizedPnl || 0) + realized,
            };
          }
          ord.status = "FILLED";
          ord.execPrice = fillPrice;
          ord.filledAt = new Date().toISOString();
          acc.journal.unshift({
            id: `TX-${ord.id}`,
            orderId: ord.id,
            symbol: ord.symbol,
            side: ord.side,
            qty: ord.qty,
            price: fillPrice,
            value: proceeds,
            realizedPnl: realized,
            fee: 0,
            timestamp: new Date().toISOString(),
          });
          stateModified = true;
        }
      }
    }

    if (stateModified) saveAccount(acc);

    // Compute portfolio valuation
    let totalPositionValue = 0;
    let totalPositionCostBasis = 0;
    let totalUnrealizedPnl = 0;

    const positionsList = Object.entries(acc.positions).map(([sym, pos]) => {
      const q = quotes[sym];
      const isLiveQuote = q && typeof q.price === "number" && Number.isFinite(q.price) && q.price > 0 && !q.error;
      const curPrice = isLiveQuote ? q.price : pos.avgPrice;
      const mktVal = curPrice * pos.qty;
      const costBasis = pos.costBasis || (pos.avgPrice * pos.qty);
      const unrealized = mktVal - costBasis;
      const unrealizedPct = costBasis > 0 ? (unrealized / costBasis) * 100 : 0;

      totalPositionValue += mktVal;
      totalPositionCostBasis += costBasis;
      totalUnrealizedPnl += unrealized;

      return {
        symbol: pos.symbol,
        name: pos.name || pos.symbol,
        qty: pos.qty,
        avgPrice: pos.avgPrice,
        costBasis,
        currentPrice: curPrice,
        marketValue: mktVal,
        unrealizedPnl: unrealized,
        unrealizedPnlPct: unrealizedPct,
        realizedPnl: pos.realizedPnl || 0,
        changePct: q?.changePct || 0,
        priceStatus: isLiveQuote ? "live" : "fallback-cost-basis",
      };
    });

    const reservedCash = acc.reservedCash || 0;
    const availableCash = Math.max(0, acc.cash - reservedCash);
    const equity = acc.cash + totalPositionValue;
    const totalPnl = equity - acc.initialCash;
    const totalPnlPct = acc.initialCash > 0 ? Number(((totalPnl / acc.initialCash) * 100).toFixed(4)) : 0;

    return {
      account: {
        cash: acc.cash,
        availableCash,
        reservedCash,
        buyingPower: availableCash,
        equity,
        initialCash: acc.initialCash,
        marketValue: totalPositionValue,
        unrealizedPnl: totalUnrealizedPnl,
        realizedPnl: acc.realizedPnl || 0,
        totalFees: acc.totalFees || 0,
        totalPnl,
        totalPnlPct,
        riskLimits: acc.riskLimits || { maxOrderNotional: null, maxPositionNotional: null, maxDailyLoss: null },
        updatedAt: acc.updatedAt,
      },
      positions: positionsList,
      orders: acc.orders.slice(0, 25),
      pendingOrders: acc.orders.filter((o) => o.status === "PENDING"),
      journal: acc.journal.slice(0, 25),
      source: "Tavoryn Execution · Local Simulated Portfolio (No External API Key Required)",
    };
  });
}
