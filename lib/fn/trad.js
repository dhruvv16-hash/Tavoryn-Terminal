// Terminal Function: TRAD (Paper Trading & Order Execution Manager)
import * as paper from "../paper-trading.js";

export default async function (params = {}) {
  const action = String(params.action || "").toLowerCase().trim();

  // Handle command-line syntax: e.g. TRAD BUY AAPL 10 or TRAD RESET
  if (action === "order" || params.side) {
    await paper.placeOrder({
      symbol: params.symbol,
      side: params.side,
      type: params.type || "MARKET",
      qty: Number(params.qty || 1),
      price: params.price ? Number(params.price) : null,
    });
  } else if (action === "cancel" && params.orderId) {
    await paper.cancelOrder(params.orderId);
  } else if (action === "reset") {
    await paper.resetAccount(params.cash ? Number(params.cash) : 100000);
  } else if (action === "get-risk-limits") {
    return { ok: true, riskLimits: paper.getRiskLimits() };
  } else if (action === "set-risk-limits") {
    const limits = await paper.setRiskLimits(params.limits || params);
    return { ok: true, riskLimits: limits };
  } else if (action === "set-fee-model") {
    const feeModel = await paper.setFeeModel(params);
    return { ok: true, feeModel };
  }

  return await paper.syncAndValuate();
}
