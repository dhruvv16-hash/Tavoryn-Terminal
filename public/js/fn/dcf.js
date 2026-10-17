// DCF: Discounted Cash Flow Intrinsic Valuation Model.
// Intrinsic share price, margin of safety, 5-year FCF projections, and WACC vs Perpetual Growth sensitivity matrix.
import { api, esc, px, pct, cls, num } from "../api.js";
import { table, kv, sect, html } from "../ui.js";

const usd = (v, d = 2) =>
  typeof v === "number" && Number.isFinite(v)
    ? `${v < 0 ? "-" : ""}$${num(Math.abs(v), d)}`
    : "—";

const perc = (v) =>
  typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(1)}%` : "—";

async function renderDcf(ctx) {
  const sec = ctx.panel?.sec;
  ctx.el.innerHTML = "";

  if (!sec) {
    ctx.el.append(
      html(
        `<p class="para">Discounted Cash Flow Intrinsic Valuation Model. Load a security first: <b class="amber">AAPL US EQUITY DCF</b> or <b class="amber">MSFT DCF</b>.</p>`,
      ),
    );
    ctx.setSource("Tavoryn Quantitative Valuation Engine (DCF)");
    return;
  }

  ctx.setTitle(`${sec.ticker} DCF Valuation`);
  ctx.setSource("Loading financial statements and cash flow projections...");

  let data;
  try {
    data = await api.fn("dcf", { symbol: sec.id });
  } catch (err) {
    ctx.el.append(
      html(
        `<div class="error" style="padding:16px">Failed to load DCF data for ${esc(sec.ticker)}: ${esc(err.message)}</div>`,
      ),
    );
    ctx.setSource("Error loading DCF data");
    return;
  }

  ctx.setSource(data.source || "Tavoryn DCF Intrinsic Valuation Model");

  const curPrice = data.currentPrice || 100;
  const baseCase = data.baseCase || {};
  const scenarios = data.scenarios || {};

  const wrap = html(`<div style="display:flex;flex-direction:column;gap:14px;padding:8px"></div>`);

  // Error Banner for Invalid Valuation Inputs (WACC <= Terminal Growth)
  if (!baseCase.isValid) {
    wrap.append(
      html(`
        <div style="background:rgba(255,80,80,0.12);border:1px solid #ff4d4d;padding:12px;border-radius:4px;color:#ff8080">
          <div style="font-weight:700;font-size:13px">INVALID VALUATION ASSUMPTIONS: ${esc(baseCase.error)}</div>
          <div style="margin-top:4px;font-size:11px;color:var(--text,#ccc);line-height:1.4">
            The Gordon Growth Model requires WACC to be strictly greater than perpetual terminal growth (WACC &gt; g<sub>term</sub>). When discount rates are equal to or lower than growth rates, terminal value becomes mathematically undefined or infinite. Adjust WACC upward or perpetual growth downward.
          </div>
        </div>
      `),
    );
  }

  // Warning Banner for Sensitivity Spread (< 100 bps spread between WACC and terminal growth)
  if (baseCase.inputs?.spreadWarning) {
    wrap.append(
      html(`
        <div style="background:rgba(255,176,0,0.1);border:1px solid var(--amber,#ffb000);padding:8px 12px;border-radius:4px;font-size:12px;color:var(--amber,#ffb000)">
          <b>SENSITIVITY WARNING:</b> ${esc(baseCase.inputs.spreadWarning)}
        </div>
      `),
    );
  }

  // Warning Banner for Negative FCF
  if (data.isNegativeFCF) {
    wrap.append(
      html(`
        <div style="background:rgba(255,80,80,0.12);border:1px solid #ff4d4d;padding:8px 12px;border-radius:4px;font-size:12px;color:#ff8080">
          <b>NEGATIVE FREE CASH FLOW:</b> ${esc(data.fcfNote)}
        </div>
      `),
    );
  } else if (data.isEstimatedFCF) {
    wrap.append(
      html(`
        <div style="background:rgba(255,176,0,0.1);border:1px solid var(--amber,#ffb000);padding:8px 12px;border-radius:4px;font-size:12px;color:var(--amber,#ffb000)">
          <b>ILLUSTRATIVE BASELINE:</b> ${esc(data.fcfNote)}
        </div>
      `),
    );
  }

  // 1. Top Summary Banner
  const mos = baseCase.marginOfSafetyPct;
  const mosClass = typeof mos === "number" ? (mos >= 0 ? "up" : "dn") : "";
  const mosLabel = typeof mos === "number" ? (mos >= 0 ? "Undervalued (Margin of Safety)" : "Overvalued (Premium)") : "Margin of Safety";

  const topBanner = html(`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;background:var(--bg-card,#141414);padding:10px;border:1px solid var(--border,#2b2b2b);border-radius:4px">
      <div>
        <div class="lbl" style="font-size:11px;color:var(--muted,#888)">CURRENT PRICE</div>
        <div style="font-size:18px;font-weight:700;color:var(--text,#fff)">${usd(curPrice)}</div>
      </div>
      <div>
        <div class="lbl" style="font-size:11px;color:var(--muted,#888)">INTRINSIC VALUE</div>
        <div style="font-size:18px;font-weight:700;color:var(--amber,#ffb000)">${baseCase.isValid ? usd(baseCase.intrinsicValuePerShare) : "—"}</div>
      </div>
      <div>
        <div class="lbl" style="font-size:11px;color:var(--muted,#888)">${mosLabel}</div>
        <div class="${mosClass}" style="font-size:18px;font-weight:700">${baseCase.isValid && typeof mos === "number" ? `${mos > 0 ? "+" : ""}${perc(mos)}` : "—"}</div>
      </div>
      <div>
        <div class="lbl" style="font-size:11px;color:var(--muted,#888)">ENTERPRISE VALUE</div>
        <div style="font-size:18px;font-weight:700;color:var(--text,#fff)">${baseCase.isValid ? `${usd(baseCase.enterpriseValue, 0)}M` : "—"}</div>
      </div>
      <div>
        <div class="lbl" style="font-size:11px;color:var(--muted,#888)">EQUITY VALUE</div>
        <div style="font-size:18px;font-weight:700;color:var(--text,#fff)">${baseCase.isValid ? `${usd(baseCase.equityValue, 0)}M` : "—"}</div>
      </div>
    </div>
  `);
  wrap.append(topBanner);

  // 2. Scenario Comparison Cards
  wrap.append(sect("Valuation Scenarios"));
  const scenGrid = html(`
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      <div style="background:var(--bg-card,#141414);padding:8px;border:1px solid var(--border,#2b2b2b);border-radius:4px">
        <div style="font-weight:700;color:var(--muted,#888);font-size:12px">CONSERVATIVE CASE</div>
        <div style="font-size:15px;font-weight:700;margin-top:4px">${scenarios.conservative?.isValid ? usd(scenarios.conservative?.intrinsicValue) : "—"}</div>
        <div class="${(scenarios.conservative?.marginOfSafety ?? 0) >= 0 ? "up" : "dn"}" style="font-size:12px">
          ${scenarios.conservative?.isValid ? perc(scenarios.conservative?.marginOfSafety) : (scenarios.conservative?.error ? "Invalid Inputs" : "—")}
        </div>
        <div style="font-size:10px;color:var(--muted,#888);margin-top:4px">
          Growth: ${perc((scenarios.conservative?.growthRate ?? 0) * 100)} | WACC: ${perc((scenarios.conservative?.wacc ?? 0) * 100)}
        </div>
      </div>
      <div style="background:var(--bg-card,#141414);padding:8px;border:1px solid var(--amber,#ffb000);border-radius:4px">
        <div style="font-weight:700;color:var(--amber,#ffb000);font-size:12px">BASE CASE</div>
        <div style="font-size:15px;font-weight:700;margin-top:4px">${scenarios.base?.isValid ? usd(scenarios.base?.intrinsicValue) : "—"}</div>
        <div class="${(scenarios.base?.marginOfSafety ?? 0) >= 0 ? "up" : "dn"}" style="font-size:12px">
          ${scenarios.base?.isValid ? perc(scenarios.base?.marginOfSafety) : (scenarios.base?.error ? "Invalid Inputs" : "—")}
        </div>
        <div style="font-size:10px;color:var(--muted,#888);margin-top:4px">
          Growth: ${perc((scenarios.base?.growthRate ?? 0) * 100)} | WACC: ${perc((scenarios.base?.wacc ?? 0) * 100)}
        </div>
      </div>
      <div style="background:var(--bg-card,#141414);padding:8px;border:1px solid var(--border,#2b2b2b);border-radius:4px">
        <div style="font-weight:700;color:var(--muted,#888);font-size:12px">OPTIMISTIC CASE</div>
        <div style="font-size:15px;font-weight:700;margin-top:4px">${scenarios.optimistic?.isValid ? usd(scenarios.optimistic?.intrinsicValue) : "—"}</div>
        <div class="${(scenarios.optimistic?.marginOfSafety ?? 0) >= 0 ? "up" : "dn"}" style="font-size:12px">
          ${scenarios.optimistic?.isValid ? perc(scenarios.optimistic?.marginOfSafety) : (scenarios.optimistic?.error ? "Invalid Inputs" : "—")}
        </div>
        <div style="font-size:10px;color:var(--muted,#888);margin-top:4px">
          Growth: ${perc((scenarios.optimistic?.growthRate ?? 0) * 100)} | WACC: ${perc((scenarios.optimistic?.wacc ?? 0) * 100)}
        </div>
      </div>
    </div>
  `);
  wrap.append(scenGrid);

  // 3. Projections Table
  wrap.append(sect("5-Year Free Cash Flow Projections ($ Millions)"));
  const projCols = [
    { key: "year", label: "Year", left: true, fmt: (v) => (typeof v === "number" ? `Year ${v}` : v) },
    { key: "fcf", label: "Projected FCF", fmt: (v) => usd(v, 1) },
    { key: "discountFactor", label: "Discount Factor", fmt: (v) => (v != null ? v.toFixed(4) : "—") },
    { key: "pv", label: "Present Value (PV)", fmt: (v) => usd(v, 1) },
  ];
  const projs = [...(baseCase.projections || [])];
  projs.push({
    year: "Terminal Value",
    fcf: baseCase.terminalValue,
    discountFactor: baseCase.inputs?.wacc > -1 ? 1 / Math.pow(1 + baseCase.inputs.wacc, baseCase.inputs.projectionYears) : null,
    pv: baseCase.pvOfTerminalValue,
  });
  wrap.append(table(projs, projCols));

  // 4. Sensitivity Matrix: WACC vs Terminal Growth Rate
  wrap.append(sect("Sensitivity Matrix: Intrinsic Fair Value vs. WACC and Perpetual Growth"));
  const sens = baseCase.sensitivity;
  if (sens && sens.matrix) {
    const tableEl = document.createElement("table");
    tableEl.className = "t";
    const headerHtml = `
      <tr>
        <th class="l">WACC \\ Perpetual Growth</th>
        ${sens.tgSteps.map((tg) => `<th>${(tg * 100).toFixed(1)}%</th>`).join("")}
      </tr>
    `;
    const rowsHtml = sens.matrix
      .map((row) => {
        const rowWacc = row[0]?.wacc;
        const isBaseWacc = Math.abs(rowWacc - baseCase.inputs.wacc) < 0.001;
        const cells = row
          .map((cell) => {
            const isBaseCell =
              isBaseWacc &&
              Math.abs(cell.terminalGrowth - baseCase.inputs.terminalGrowthRate) < 0.001;
            const borderStyle = isBaseCell
              ? "border:1px solid var(--amber,#ffb000);font-weight:700;"
              : "";
            if (!cell.isValid || cell.intrinsicValue == null) {
              return `<td class="muted" style="${borderStyle}color:var(--muted,#666);text-align:right;font-size:11px">N/A</td>`;
            }
            const diff = cell.intrinsicValue - curPrice;
            const cCls = diff >= 0 ? "up" : "dn";
            return `<td class="${cCls}" style="${borderStyle}">${usd(cell.intrinsicValue, 2)}</td>`;
          })
          .join("");
        return `<tr><td class="l" style="${isBaseWacc ? "font-weight:700;color:var(--amber,#ffb000)" : ""}">${(rowWacc * 100).toFixed(1)}%</td>${cells}</tr>`;
      })
      .join("");

    tableEl.innerHTML = `<thead>${headerHtml}</thead><tbody>${rowsHtml}</tbody>`;
    wrap.append(tableEl);
    wrap.append(html(`<div class="hint" style="font-size:10px;color:var(--muted,#888);margin-top:2px">N/A indicates WACC &le; Perpetual Growth rate, where the Gordon Growth terminal value is mathematically undefined.</div>`));
  }

  // 5. Model Parameters Key-Value
  wrap.append(sect("Key Valuation Assumptions"));
  const sharesLabel =
    data.sharesSource === "derived_from_market_cap"
      ? "Diluted Shares (Implied from Mkt Cap / Price)"
      : data.sharesSource === "fallback_estimate"
        ? "Shares Outstanding (Estimated Fallback)"
        : data.sharesSource === "user_override"
          ? "Shares Outstanding (User Override)"
          : "Shares Outstanding (Reported)";

  const kvGrid = kv([
    ["Base Free Cash Flow (FCF)", `${usd(baseCase.inputs?.baseFCF, 1)}M`],
    ["5-Year Projected Growth Rate", perc((baseCase.inputs?.growthRate ?? 0) * 100)],
    ["Discount Rate (WACC)", perc((baseCase.inputs?.wacc ?? 0) * 100)],
    ["Perpetual Terminal Growth Rate", perc((baseCase.inputs?.terminalGrowthRate ?? 0) * 100)],
    [sharesLabel, `${num(baseCase.inputs?.sharesOutstanding, 1)}M`],
    ["Cash & Short-Term Investments", `${usd(baseCase.inputs?.cashAndEquivalents, 1)}M`],
    ["Total Debt", `${usd(baseCase.inputs?.totalDebt, 1)}M`],
    ["Net Debt", `${usd(baseCase.inputs?.netDebt, 1)}M`],
  ]);
  wrap.append(kvGrid);

  // Methodology and Disclaimers
  wrap.append(
    html(`
      <div style="margin-top:10px;padding:8px;background:var(--bg-card,#141414);border:1px solid var(--border,#2b2b2b);border-radius:4px;font-size:11px;color:var(--muted,#888)">
        <div><b>Methodology:</b> ${esc(data.methodology)}</div>
        <div style="margin-top:4px"><b>Data Source:</b> ${esc(data.fcfNote)}</div>
        ${data.sharesNote ? `<div style="margin-top:4px"><b>Share Count Provenance:</b> ${esc(data.sharesNote)}</div>` : ""}
        <div style="margin-top:4px;font-style:italic"><b>Risk Disclaimer:</b> Margin of Safety is a theoretical quantitative estimate and does not guarantee market performance or downside capital protection.</div>
      </div>
    `),
  );

  ctx.el.append(wrap);
}

export default [
  {
    id: "DCF",
    name: "DCF Valuation Model",
    group: "Equities",
    needs: true,
    source:
      "Tavoryn Quantitative Valuation Engine. Free cash flows derived from SEC/Nasdaq filings and live pricing.",
    render: renderDcf,
  },
];
