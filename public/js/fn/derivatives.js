// Derivatives Options Strategy Builder & Payoff Diagram (OPAY)
import { api, esc } from "../api.js";
import { table, kv, sect, html } from "../ui.js";

function num(v, dp = 2) {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(dp) : "—";
}

function signed(v, dp = 2) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(dp)}`;
}

function cls(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  return v > 0 ? "up" : v < 0 ? "down" : "";
}

export default [
  {
    id: "OPAY",
    name: "Options strategy payoff analyzer",
    group: "derivatives",
    source: "Black-Scholes analytical options valuation engine",
    needs: null,
    async render(ctx) {
      const parts = Array.isArray(ctx.args)
        ? ctx.args
        : String(ctx.args || "").trim().split(/\s+/).filter(Boolean);

      const params = {};
      if (parts[0] && !isNaN(parts[0])) params.spot = parts[0];
      if (parts[1]) params.strategy = parts[1];

      const qs = new URLSearchParams(params).toString();
      const d = await api.get(`/api/fn/opay${qs ? `?${qs}` : ""}`);
      if (!ctx.live()) return;
      ctx.el.innerHTML = "";

      // Quick strategy selector buttons
      const stratButtons = (d.availableStrategies || [])
        .map(
          (s) =>
            `<button class="tab ${s === d.strategyName ? "active" : ""}" data-s="${s}">${s.replace(/_/g, " ")}</button>`,
        )
        .join(" ");

      ctx.el.append(
        html(
          `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px">` +
            `<span class="dim">Strategy:</span> ${stratButtons}` +
          `</div>` +
          `<div style="font-size:15px;margin-bottom:8px">` +
            `<b class="amber">${d.strategyName.replace(/_/g, " ")}</b> on Spot: <b class="amber">$${num(d.spot, 2)}</b> · ` +
            `DTE: <b class="amber">${d.daysToExpiry}d</b> · ` +
            `IV: <b class="amber">${num(d.iv, 1)}%</b> · ` +
            `Cost: <b style="font-size:15px;color:var(--white)">$${num(Math.abs(d.netCost), 2)} ${d.isCredit ? "(Credit)" : "(Debit)"}</b>` +
          `</div>`,
        ),
      );

      // Key metrics
      ctx.el.append(sect("Risk / Reward & Greeks"));
      ctx.el.append(
        kv([
          ["Net Entry Cost", `$${num(Math.abs(d.netCost), 2)} ${d.isCredit ? "Credit" : "Debit"}`],
          ["Max Profit", d.maxProfit === "Unlimited" ? "Unlimited" : `$${num(d.maxProfit, 2)}`],
          ["Max Loss", d.maxLoss === "Unlimited" ? "Unlimited" : `$${num(d.maxLoss, 2)}`],
          ["Breakeven(s)", d.breakevens.length ? d.breakevens.map((b) => `$${num(b, 2)}`).join(", ") : "None"],
          ["Net Delta", num(d.greeks.netDelta, 3)],
          ["Net Gamma", num(d.greeks.netGamma, 4)],
          ["Net Theta", `${signed(d.greeks.netTheta, 2)}/day`],
          ["Net Vega", `${signed(d.greeks.netVega, 2)}/1% IV`],
        ]),
      );

      // Strategy Legs table
      ctx.el.append(sect("Strategy Legs"));
      ctx.el.append(
        table(
          d.legs,
          [
            { key: "action", label: "Action", left: true, fmt: (v) => v.toUpperCase(), cls: (v) => (v === "buy" ? "up" : "down") },
            { key: "qty", label: "Qty", fmt: (v) => num(v, 0) },
            { key: "type", label: "Type", fmt: (v) => v.toUpperCase(), lbl: true },
            { key: "strike", label: "Strike", fmt: (v) => `$${num(v, 2)}` },
            { key: "premium", label: "Premium", fmt: (v) => `$${num(v, 2)}` },
            { key: "delta", label: "Delta", fmt: (v) => num(v, 2) },
            { key: "theta", label: "Theta", fmt: (v) => signed(v, 2) },
          ],
        ),
      );

      // Expiry Payoff profile table
      ctx.el.append(sect("Payoff Profile Across Underlying Spot"));
      ctx.el.append(
        table(
          d.payoffCurve.filter((_, i) => i % 4 === 0), // Sample 13 points for clean table
          [
            { key: "spot", label: "Underlying Spot", left: true, fmt: (v) => `$${num(v, 2)}` },
            { key: "expiryPnl", label: "P&L at Expiry ($)", fmt: signed, cls },
            { key: "halfLifePnl", label: "P&L at Mid-Life ($)", fmt: signed, cls },
          ],
        ),
      );

      // Click handler for strategy tabs
      ctx.el.querySelectorAll("button[data-s]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const s = btn.getAttribute("data-s");
          ctx.go(`OPAY ${d.spot} ${s}`);
        });
      });

      ctx.setSource(d.source);
    },
  },
];
