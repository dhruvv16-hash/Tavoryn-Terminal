// SCRN: Multi-Asset Market Screener (Crypto, Forex, ETFs, Stocks)
import { api, esc, px, pct, cls, big, num } from "../api.js";
import { table, sect, html } from "../ui.js";

const UNIVERSES = [
  { id: "crypto", label: "CRYPTO" },
  { id: "forex", label: "FOREX" },
  { id: "etf", label: "ETFS" },
  { id: "stocks", label: "STOCKS" },
];

export default [
  {
    id: "SCRN",
    name: "Multi-asset market screener",
    group: "screener",
    source: "Tavoryn Screener Engine",
    async render(ctx) {
      let activeUni = "crypto";
      let sortKey = "changePct";
      let sortDir = "desc";
      let filterQ = "";
      let minChg = "";
      let maxChg = "";

      const parts = Array.isArray(ctx.args)
        ? ctx.args
        : String(ctx.args || "").trim().split(/\s+/).filter(Boolean);

      if (parts[0]) {
        const uMatch = UNIVERSES.find((u) => u.id === parts[0].toLowerCase() || u.label === parts[0].toUpperCase());
        if (uMatch) activeUni = uMatch.id;
      }

      if (!ctx.live()) return;
      ctx.el.innerHTML = "";

      const container = document.createElement("div");
      ctx.el.append(container);

      const load = async () => {
        const qs = new URLSearchParams({
          universe: activeUni,
          sort: sortKey,
          dir: sortDir,
          ...(filterQ ? { q: filterQ } : {}),
          ...(minChg ? { minChange: minChg } : {}),
          ...(maxChg ? { maxChange: maxChg } : {}),
        }).toString();

        let d;
        try {
          d = await api.get(`/api/fn/scrn?${qs}`);
        } catch (e) {
          if (!ctx.live()) return;
          container.innerHTML = `<div class="hint">Failed to load screener: ${esc(e.message)}</div>`;
          return;
        }

        if (!ctx.live()) return;
        container.innerHTML = "";

        // Universe switcher tabs
        const tabButtons = UNIVERSES.map(
          (u) =>
            `<button class="tab ${u.id === activeUni ? "active" : ""}" data-uni="${u.id}">${u.label}</button>`,
        ).join(" ");

        // Top Filter Bar
        const topBar = html(
          `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px">` +
            `<span class="dim">Asset Class:</span> ${tabButtons}` +
            `<span style="margin-left:auto;display:flex;gap:6px;align-items:center">` +
              `<input class="scrn-q" placeholder="Filter ticker/name" style="width:130px" value="${esc(filterQ)}">` +
              `<input class="scrn-min-chg" placeholder="Min %" style="width:60px" value="${esc(minChg)}">` +
              `<input class="scrn-max-chg" placeholder="Max %" style="width:60px" value="${esc(maxChg)}">` +
              `<button class="tab active scrn-filter-btn" style="padding:2px 8px">Filter</button>` +
              `<button class="tab scrn-reset-btn" style="padding:2px 6px">Clear</button>` +
            `</span>` +
          `</div>`,
        );
        container.append(topBar);

        // Summary Bar
        container.append(
          html(
            `<div style="display:flex;gap:12px;align-items:center;margin-bottom:8px;font-size:12px">` +
              `<span>Showing: <b class="amber">${d.total}</b> of ${d.universeTotal} instruments</span>` +
              `<span>Gainers: <b class="up">${d.gainers}</b></span>` +
              `<span>Losers: <b class="down">${d.losers}</b></span>` +
              (d.totalVolume ? `<span>Total Volume: <b class="amber">$${big(d.totalVolume)}</b></span>` : "") +
              `<span class="dim" style="margin-left:auto">Click column header to sort · Click row to chart</span>` +
            `</div>`,
          ),
        );

        // Columns definition according to universe
        let cols = [];
        if (activeUni === "forex") {
          cols = [
            { key: "ticker", label: "Currency Pair", left: true, lbl: true },
            { key: "name", label: "Description", left: true },
            { key: "price", label: "Exchange Rate", fmt: (v) => px(v) },
            { key: "changePct", label: "24h Move %", fmt: (v) => pct(v), cls },
            { key: "pips", label: "Net Pips", fmt: (v) => (typeof v === "number" ? `${v > 0 ? "+" : ""}${v}` : "—"), cls },
          ];
        } else if (activeUni === "crypto") {
          cols = [
            { key: "ticker", label: "Pair", left: true, lbl: true },
            { key: "name", label: "Asset", left: true },
            { key: "price", label: "Price ($)", fmt: (v) => px(v) },
            { key: "changePct", label: "24h Chg %", fmt: (v) => pct(v), cls },
            { key: "volume", label: "24h Volume", fmt: (v) => (v ? `$${big(v)}` : "—") },
            { key: "high", label: "24h High", fmt: (v) => px(v) },
            { key: "low", label: "24h Low", fmt: (v) => px(v) },
          ];
        } else {
          // Equities or ETFs
          cols = [
            { key: "ticker", label: "Symbol", left: true, lbl: true },
            { key: "name", label: "Company / Fund", left: true },
            { key: "price", label: "Last Price", fmt: (v) => `$${num(v, 2)}` },
            { key: "changePct", label: "Day Move %", fmt: (v) => pct(v), cls },
            { key: "volume", label: "Volume", fmt: (v) => big(v) },
            { key: "marketCap", label: "Market Cap", fmt: (v) => (v ? `$${big(v)}` : "—") },
            { key: "sector", label: "Sector", left: true },
          ];
        }

        // Table Element
        const t = table(d.rows, cols, {
          onRow: (r) => {
            if (activeUni === "forex") {
              ctx.go(`${r.symbol} GP`);
            } else if (activeUni === "crypto") {
              ctx.go(`${r.symbol} GP`);
            } else {
              ctx.go(`${r.ticker} US EQUITY DES`);
            }
          },
        });

        // Add sorting click handlers on headers
        t.querySelectorAll("th").forEach((th, idx) => {
          const c = cols[idx];
          if (!c) return;
          th.style.cursor = "pointer";
          if (c.key === sortKey) {
            th.textContent += sortDir === "asc" ? " ▲" : " ▼";
          }
          th.addEventListener("click", () => {
            if (sortKey === c.key) {
              sortDir = sortDir === "asc" ? "desc" : "asc";
            } else {
              sortKey = c.key;
              sortDir = c.key === "ticker" || c.key === "name" ? "asc" : "desc";
            }
            load();
          });
        });

        container.append(t);

        // Event listeners for tabs & filters
        topBar.querySelectorAll("button[data-uni]").forEach((btn) => {
          btn.addEventListener("click", () => {
            activeUni = btn.dataset.uni;
            sortKey = "changePct";
            sortDir = "desc";
            load();
          });
        });

        const qInput = topBar.querySelector(".scrn-q");
        const minChgInput = topBar.querySelector(".scrn-min-chg");
        const maxChgInput = topBar.querySelector(".scrn-max-chg");

        topBar.querySelector(".scrn-filter-btn").addEventListener("click", () => {
          filterQ = qInput.value.trim();
          minChg = minChgInput.value.trim();
          maxChg = maxChgInput.value.trim();
          load();
        });

        topBar.querySelector(".scrn-reset-btn").addEventListener("click", () => {
          filterQ = "";
          minChg = "";
          maxChg = "";
          qInput.value = "";
          minChgInput.value = "";
          maxChgInput.value = "";
          load();
        });

        ctx.setSource(d.source);
      };

      await load();
      ctx.every(30e3, () => load().catch(() => {}));
    },
  },
];
