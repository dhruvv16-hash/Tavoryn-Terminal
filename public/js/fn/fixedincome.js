// Fixed Income & Bond Analytics screen (BNDC)
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
    id: "BNDC",
    name: "Bond calculator and analytics",
    group: "fixedincome",
    source: "US Treasury par yield conventions & analytical models",
    needs: null,
    async render(ctx) {
      const parts = Array.isArray(ctx.args)
        ? ctx.args
        : String(ctx.args || "").trim().split(/\s+/).filter(Boolean);
      const params = {};
      if (parts[0] && !isNaN(parts[0])) params.coupon = parts[0];
      if (parts[1] && !isNaN(parts[1])) params.ytm = parts[1];
      if (parts[2] && !isNaN(parts[2])) params.maturity = parts[2];

      const qs = new URLSearchParams(params).toString();
      const d = await api.get(`/api/fn/bndc${qs ? `?${qs}` : ""}`);
      if (!ctx.live()) return;
      ctx.el.innerHTML = "";

      // Quick benchmarks bar
      const bmarks = d.benchmarks || [];
      const benchHtml = bmarks
        .map(
          (b) =>
            `<button class="tab" data-c="${b.coupon}" data-y="${b.ytm}" data-m="${b.maturity}">${esc(b.name)} (${b.ytm}%)</button>`,
        )
        .join(" ");

      ctx.el.append(
        html(
          `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">` +
            `<span class="dim">Benchmarks:</span> ${benchHtml}` +
          `</div>` +
          `<div style="font-size:15px;margin-bottom:8px">` +
            `<b class="amber">${num(d.inputs.maturityYears, 0)}Y Bond</b> @ <b class="amber">${num(d.inputs.couponPct, 3)}% Coupon</b> · ` +
            `YTM: <b class="amber">${num(d.inputs.ytmPct, 3)}%</b> · ` +
            `Price: <b style="font-size:16px;color:var(--white)">$${num(d.pricing.cleanPrice, 3)}</b>` +
          `</div>`,
        ),
      );

      // Key metrics
      ctx.el.append(sect("Pricing & Risk Sensitivities"));
      ctx.el.append(
        kv([
          ["Clean Price", `$${num(d.pricing.cleanPrice, 3)}`],
          ["Current Yield", `${num(d.pricing.currentYield, 2)}%`],
          ["Macaulay Duration", `${num(d.pricing.macaulayDuration, 2)} yrs`],
          ["Modified Duration", `${num(d.pricing.modifiedDuration, 2)} yrs`],
          ["Convexity", `${num(d.pricing.convexity, 2)}`],
          ["DV01 (per $100 par)", `$${num(d.pricing.dv01, 4)}`],
        ]),
      );

      // Interest-rate shock scenarios
      ctx.el.append(sect("Interest-Rate Shock Scenarios (Instantaneous Parallel Shifts)"));
      ctx.el.append(
        table(
          d.scenarios,
          [
            { key: "bp", label: "Rate Shift", fmt: (v) => `${signed(v, 0)} bp`, cls: (v) => (v < 0 ? "up" : v > 0 ? "down" : ""), left: true },
            { key: "shockedYtm", label: "Yield (%)", fmt: (v) => `${num(v, 3)}%` },
            { key: "newPrice", label: "Clean Price", fmt: (v) => `$${num(v, 3)}` },
            { key: "pnl", label: "Price P&L ($)", fmt: signed, cls },
            { key: "pnlPct", label: "Total Return (%)", fmt: (v) => `${signed(v, 2)}%`, cls },
          ],
        ),
      );

      // Cash flow projection
      ctx.el.append(sect("Cash Flow Schedule (First 24 Periods)"));
      ctx.el.append(
        table(
          d.cashflows,
          [
            { key: "period", label: "Period", left: true },
            { key: "timeYears", label: "Time (Yrs)", fmt: (v) => num(v, 2) },
            { key: "cashflow", label: "Cash Flow ($)", fmt: (v) => `$${num(v, 2)}` },
            { key: "df", label: "Discount Factor", fmt: (v) => num(v, 4) },
            { key: "pv", label: "Present Value ($)", fmt: (v) => `$${num(v, 2)}` },
          ],
        ),
      );

      // Event listener for benchmark buttons
      ctx.el.querySelectorAll("button[data-c]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const c = btn.getAttribute("data-c");
          const y = btn.getAttribute("data-y");
          const m = btn.getAttribute("data-m");
          ctx.go(`BNDC ${c} ${y} ${m}`);
        });
      });

      ctx.setSource(d.source);
    },
  },
];
