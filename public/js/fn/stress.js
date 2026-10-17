// STRESS: Portfolio Macro Crisis Scenario & Stress Testing Engine.
// Simulates portfolio drawdowns across 8 historical financial crises and 4 macro factor shocks.
import { api, esc, num, pct, cls } from "../api.js";
import { table, kv, sect, html } from "../ui.js";

const usd = (v, d = 0) =>
  typeof v === "number" && Number.isFinite(v)
    ? `${v < 0 ? "-" : ""}$${num(Math.abs(v), d)}`
    : "—";

const perc = (v) =>
  typeof v === "number" && Number.isFinite(v)
    ? `${v > 0 ? "+" : ""}${v.toFixed(1)}%`
    : "—";

async function renderStress(ctx) {
  ctx.el.innerHTML = "";
  const isBenchArg = (ctx.args || []).map((a) => String(a).toUpperCase()).includes("BENCHMARK");
  ctx.setTitle(isBenchArg ? "BENCHMARK STRESS: Scenario Analysis" : "PORT STRESS: Scenario Analysis");
  ctx.setSource("Evaluating portfolio stress across historical crises and macro factor shocks...");

  let data;
  try {
    data = await api.fn("stress", isBenchArg ? { benchmark: 1 } : {});
  } catch (err) {
    ctx.el.append(
      html(
        `<div class="error" style="padding:16px">Failed to load stress testing engine: ${esc(err.message)}</div>`,
      ),
    );
    ctx.setSource("Error running stress tests");
    return;
  }

  ctx.setSource(data.source || "Tavoryn Portfolio Stress Testing Engine");

  const wrap = html(`<div style="display:flex;flex-direction:column;gap:14px;padding:8px"></div>`);

  // 1. Truthful Empty State
  if (data.empty) {
    wrap.append(
      html(`
        <div style="background:var(--bg-card,#141414);border:1px solid var(--border,#2b2b2b);padding:24px;border-radius:4px;text-align:center;max-width:650px;margin:24px auto">
          <div style="font-size:16px;font-weight:700;color:var(--amber,#ffb000);margin-bottom:8px">NO ACTIVE PORTFOLIO POSITIONS DETECTED</div>
          <p class="para" style="margin-bottom:14px;color:var(--text,#fff);font-size:13px">
            Your portfolio in <b class="amber">PORT</b> currently has 0 holdings. Stress testing requires active portfolio positions to calculate exposures, betas, and historical crisis drawdowns.
          </p>
          <div style="font-size:12px;color:var(--muted,#888);line-height:1.6;text-align:left;background:#0d0d0d;padding:12px;border:1px solid #222;border-radius:4px">
            <div>• <b>Add positions:</b> Type <b class="amber">PORT ADD SPY 100 500</b>, <b class="amber">PORT ADD AAPL 50 200</b>, or <b class="amber">PORT IMPORT</b></div>
            <div style="margin-top:4px">• <b>Evaluate standard benchmark:</b> Type <b class="amber">STRESS BENCHMARK</b> to run simulations on a 5-asset reference portfolio (SPY, QQQ, TLT, GLD, BTC).</div>
          </div>
        </div>
      `),
    );
    ctx.el.append(wrap);
    return;
  }

  // 2. Mode Header Badge
  if (data.isBenchmark) {
    wrap.append(
      html(`
        <div style="background:rgba(255,176,0,0.12);border:1px solid var(--amber,#ffb000);padding:8px 12px;border-radius:4px;font-size:12px;color:var(--amber,#ffb000)">
          <b>BENCHMARK SIMULATION MODE:</b> Evaluating standard institutional 5-asset benchmark (40% SPY, 30% QQQ, 15% TLT, 10% GLD, 5% BTC). <i>This is a reference benchmark, NOT your personal portfolio.</i>
        </div>
      `),
    );
  } else {
    wrap.append(
      html(`
        <div style="background:rgba(90,174,255,0.1);border:1px solid #5aaeff;padding:8px 12px;border-radius:4px;font-size:12px;color:#5aaeff">
          <b>ACTIVE PORTFOLIO STRESS:</b> Evaluating ${data.holdingsCount} active positions from your portfolio (data/state.json).
        </div>
      `),
    );
  }

  // 3. Portfolio Baseline Metrics
  const baseMetrics = html(`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;background:var(--bg-card,#141414);padding:10px;border:1px solid var(--border,#2b2b2b);border-radius:4px">
      <div>
        <div class="lbl" style="font-size:11px;color:var(--muted,#888)">PORTFOLIO VALUE</div>
        <div style="font-size:18px;font-weight:700;color:var(--text,#fff)">${usd(data.portfolioValue)}</div>
      </div>
      <div>
        <div class="lbl" style="font-size:11px;color:var(--muted,#888)">HOLDINGS COUNT</div>
        <div style="font-size:18px;font-weight:700;color:var(--amber,#ffb000)">${data.holdingsCount} Positions</div>
      </div>
      <div>
        <div class="lbl" style="font-size:11px;color:var(--muted,#888)">PORTFOLIO BETA (vs SPX)</div>
        <div style="font-size:18px;font-weight:700;color:var(--text,#fff)">${data.marketBeta != null ? data.marketBeta.toFixed(2) : "1.00"}</div>
      </div>
      <div>
        <div class="lbl" style="font-size:11px;color:var(--muted,#888)">ANNUAL VOLATILITY</div>
        <div style="font-size:18px;font-weight:700;color:var(--text,#fff)">${data.annualVolatility != null ? perc(data.annualVolatility * 100) : "—"}</div>
      </div>
    </div>
  `);
  wrap.append(baseMetrics);

  // 4. Historical Crisis Simulations Table
  wrap.append(sect("Historical Market Crisis Scenarios"));
  const crisisCols = [
    { key: "name", label: "Crisis Scenario", left: true, wrap: true },
    { key: "period", label: "Date / Episode", left: true },
    {
      key: "totalDrawdownPct",
      label: "Portfolio Drawdown",
      cls: (v) => (v < 0 ? "dn" : "up"),
      fmt: (v) => perc(v),
    },
    {
      key: "totalDollarLoss",
      label: "Scenario P&L",
      cls: (v) => (v < 0 ? "dn" : "up"),
      fmt: (v) => usd(v),
    },
    {
      key: "stressedTotalValue",
      label: "Stressed Portfolio Value",
      fmt: (v) => usd(v),
    },
    { key: "description", label: "Macro Mechanism", left: true, wrap: true },
  ];
  wrap.append(table(data.historicalCrises || [], crisisCols));

  // 5. Macroeconomic Factor Shocks Table
  wrap.append(sect("Macroeconomic Factor Shocks"));
  const factorCols = [
    { key: "name", label: "Factor Shock", left: true, wrap: true },
    {
      key: "totalDrawdownPct",
      label: "Portfolio Impact",
      cls: (v) => (v < 0 ? "dn" : "up"),
      fmt: (v) => perc(v),
    },
    {
      key: "totalDollarLoss",
      label: "Estimated P&L",
      cls: (v) => (v < 0 ? "dn" : "up"),
      fmt: (v) => usd(v),
    },
    {
      key: "stressedTotalValue",
      label: "Stressed Value",
      fmt: (v) => usd(v),
    },
    { key: "description", label: "Transmission Channel", left: true, wrap: true },
  ];
  wrap.append(table(data.macroShocks || [], factorCols));

  // 6. Holding Vulnerability Ranking
  wrap.append(sect("Constituent Vulnerability Ranking (Worst Dollar Drawdowns)"));
  const vulCols = [
    { key: "ticker", label: "Holding", left: true },
    { key: "sector", label: "Sector / Asset Class", left: true },
    { key: "value", label: "Position Value", fmt: (v) => usd(v) },
    { key: "weight", label: "Weight", fmt: (v) => `${(v ?? 0).toFixed(1)}%` },
    { key: "beta", label: "Beta", fmt: (v) => (v != null ? v.toFixed(2) : "1.00") },
    {
      key: "worstLossPct",
      label: "Max Crisis Drawdown",
      cls: (v) => (v < 0 ? "dn" : "up"),
      fmt: (v) => perc(v),
    },
    {
      key: "worstLoss",
      label: "Max Dollar Loss",
      cls: (v) => (v < 0 ? "dn" : "up"),
      fmt: (v) => usd(v),
    },
    { key: "worstScenario", label: "Most Vulnerable Crisis", left: true, wrap: true },
  ];
  wrap.append(table(data.vulnerabilities || [], vulCols));

  // Methodology & Disclaimer Box
  wrap.append(
    html(`
      <div style="margin-top:10px;padding:8px;background:var(--bg-card,#141414);border:1px solid var(--border,#2b2b2b);border-radius:4px;font-size:11px;color:var(--muted,#888)">
        <div><b>Risk Methodology:</b> ${esc(data.methodology)}</div>
        <div style="margin-top:4px;font-style:italic"><b>Risk Disclaimer:</b> Scenario losses are estimated factor projections based on historical index proxies, not a guarantee or statistical probability distribution of future losses.</div>
      </div>
    `),
  );

  ctx.el.append(wrap);
}

export default [
  {
    id: "STRESS",
    name: "Portfolio Stress Testing",
    group: "Workspace",
    source:
      "Tavoryn Portfolio Stress Testing Engine (STRESS). Empirical historical crisis drawdowns and factor shocks applied to holdings.",
    render: renderStress,
  },
];
