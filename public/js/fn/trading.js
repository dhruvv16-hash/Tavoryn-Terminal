// TRAD: Paper Trading Portfolio & Order Execution Manager
import { api, esc, num, px, pct, cls } from "../api.js";
import { table, kv, sect, html } from "../ui.js";

export function signed(v, dp = 2) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const d = typeof dp === "number" ? dp : 2;
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}$${num(Math.abs(v), d)}`;
}

export default [
  {
    id: "TRAD",
    name: "Paper trading portfolio & execution manager",
    group: "portfolio",
    source: "Tavoryn Execution · Local Simulated Portfolio",
    async render(ctx) {
      const parts = Array.isArray(ctx.args)
        ? ctx.args
        : String(ctx.args || "").trim().split(/\s+/).filter(Boolean);

      // Check for quick command: e.g. TRAD BUY AAPL 10 or TRAD RESET
      if (parts[0]) {
        const actionOrSide = parts[0].toUpperCase();
        if (actionOrSide === "RESET") {
          try {
            await api.post("/api/trad/reset", { cash: 100000 });
            ctx.toast("Simulated account reset to $100,000");
          } catch (e) {
            ctx.toast(e.message, true);
          }
        } else if (actionOrSide === "BUY" || actionOrSide === "SELL") {
          const sym = parts[1];
          const qty = Number(parts[2] || 1);
          const pxLimit = parts[3] ? Number(parts[3]) : null;
          if (sym) {
            try {
              const res = await api.post("/api/trad/order", {
                symbol: sym,
                side: actionOrSide,
                type: pxLimit ? "LIMIT" : "MARKET",
                qty,
                price: pxLimit,
              });
              ctx.toast(`Order ${res.order.status}: ${actionOrSide} ${qty} ${sym}`);
            } catch (e) {
              ctx.toast(`Order failed: ${e.message}`, true);
            }
          }
        }
        ctx.setCmd("TRAD");
      }

      if (!ctx.live()) return;
      ctx.el.innerHTML = "";

      const container = document.createElement("div");
      ctx.el.append(container);

      const renderView = async () => {
        let d;
        try {
          d = await api.get("/api/fn/trad");
        } catch (e) {
          if (!ctx.live()) return;
          container.innerHTML = `<div class="hint">Failed to load paper trading account: ${esc(e.message)}</div>`;
          return;
        }

        if (!ctx.live()) return;
        container.innerHTML = "";

        const a = d.account;

        // Portfolio Summary Metrics
        container.append(sect("Portfolio Summary"));
        container.append(
          kv([
            ["Account Equity", `$${num(a.equity, 2)}`],
            ["Cash Available", `$${num(a.cash, 2)}`],
            ["Holdings Value", `$${num(a.marketValue, 2)}`],
            ["Unrealized P&L", `${signed(a.unrealizedPnl, 2)}`],
            ["Realized P&L", `${signed(a.realizedPnl, 2)}`],
            ["Total Net P&L", `${signed(a.totalPnl, 2)} (${pct(a.totalPnlPct)})`],
          ]),
        );

        // Order Execution Ticket Form
        container.append(sect("Order Entry Ticket"));
        const orderForm = html(
          `<form class="wform" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:12px">` +
            `<select class="ord-side" style="font-weight:bold;color:var(--amber)">` +
              `<option value="BUY">BUY</option>` +
              `<option value="SELL">SELL</option>` +
            `</select>` +
            `<input class="ord-sym" placeholder="Symbol (e.g. AAPL, BTC)" style="width:140px;text-transform:uppercase" required value="AAPL">` +
            `<select class="ord-type">` +
              `<option value="MARKET">MARKET</option>` +
              `<option value="LIMIT">LIMIT</option>` +
            `</select>` +
            `<input class="ord-qty" type="number" step="any" min="0.0001" placeholder="Qty" style="width:80px" value="10" required>` +
            `<input class="ord-px" type="number" step="any" placeholder="Limit Px" style="width:90px;display:none">` +
            `<button type="submit" class="tab active" style="font-weight:bold">TRANSMIT ORDER</button>` +
            `<button type="button" class="tab ord-reset" style="margin-left:auto;color:var(--down)">RESET PORTFOLIO</button>` +
          `</form>`,
        );
        container.append(orderForm);

        // Limit price toggle handler
        const typeSelect = orderForm.querySelector(".ord-type");
        const pxInput = orderForm.querySelector(".ord-px");
        typeSelect.addEventListener("change", () => {
          pxInput.style.display = typeSelect.value === "LIMIT" ? "inline-block" : "none";
        });

        // Form submit handler
        orderForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const side = orderForm.querySelector(".ord-side").value;
          const symbol = orderForm.querySelector(".ord-sym").value.trim();
          const type = typeSelect.value;
          const qty = Number(orderForm.querySelector(".ord-qty").value);
          const price = type === "LIMIT" ? Number(pxInput.value) : null;

          try {
            const res = await api.post("/api/trad/order", { symbol, side, type, qty, price });
            ctx.toast(`Order ${res.order.status}: ${side} ${qty} ${symbol}`);
            renderView();
          } catch (err) {
            ctx.toast(`Order rejected: ${err.message}`, true);
          }
        });

        // Reset account handler
        const resetBtn = orderForm.querySelector(".ord-reset");
        resetBtn.addEventListener("click", async () => {
          if (confirm("Reset paper trading account to $100,000 cash balance and clear all positions?")) {
            try {
              await api.post("/api/trad/reset", { cash: 100000 });
              ctx.toast("Account reset to $100,000");
              renderView();
            } catch (err) {
              ctx.toast(err.message, true);
            }
          }
        });

        // Open Positions Table
        container.append(sect(`Open Positions (${d.positions.length})`));
        if (!d.positions.length) {
          container.append(html(`<div class="hint">No open positions. Use the order ticket above or enter TRAD BUY AAPL 10.</div>`));
        } else {
          container.append(
            table(
              d.positions,
              [
                { key: "symbol", label: "Symbol", left: true, lbl: true },
                { key: "name", label: "Description", left: true },
                { key: "qty", label: "Position Qty", fmt: (v) => num(v, v % 1 === 0 ? 0 : 4) },
                { key: "avgPrice", label: "Entry Price", fmt: (v) => `$${num(v, 2)}` },
                { key: "currentPrice", label: "Mark Price", fmt: (v) => `$${num(v, 2)}` },
                { key: "marketValue", label: "Market Value", fmt: (v) => `$${num(v, 2)}` },
                { key: "unrealizedPnl", label: "Unrealized P&L", fmt: (v) => signed(v), cls },
                { key: "unrealizedPnlPct", label: "Return %", fmt: (v) => pct(v), cls },
                {
                  key: "symbol",
                  label: "Action",
                  html: true,
                  fmt: (sym, row) =>
                    `<button class="tab close-pos-btn" data-sym="${esc(sym)}" data-qty="${row.qty}" style="padding:1px 6px">Close</button>`,
                },
              ],
            ),
          );
        }

        // Pending Limit Orders Table
        if (d.pendingOrders?.length) {
          container.append(sect(`Working Limit Orders (${d.pendingOrders.length})`));
          container.append(
            table(
              d.pendingOrders,
              [
                { key: "id", label: "Order ID", left: true, lbl: true },
                { key: "side", label: "Side", cls: (v) => (v === "BUY" ? "up" : "down") },
                { key: "symbol", label: "Symbol", left: true },
                { key: "type", label: "Type" },
                { key: "qty", label: "Qty", fmt: (v) => num(v, 0) },
                { key: "limitPrice", label: "Limit Price", fmt: (v) => `$${num(v, 2)}` },
                { key: "status", label: "Status" },
                {
                  key: "id",
                  label: "Action",
                  html: true,
                  fmt: (id) =>
                    `<button class="tab cancel-ord-btn" data-id="${esc(id)}" style="padding:1px 6px;color:var(--down)">Cancel</button>`,
                },
              ],
            ),
          );
        }

        // Trade Execution History / Journal
        if (d.journal?.length) {
          container.append(sect(`Trade Journal & Recent Executions (${d.journal.length})`));
          container.append(
            table(
              d.journal,
              [
                { key: "timestamp", label: "Time", left: true, fmt: (v) => (v ? new Date(v).toLocaleTimeString() : "—") },
                { key: "side", label: "Side", cls: (v) => (v === "BUY" ? "up" : "down") },
                { key: "symbol", label: "Symbol", left: true, lbl: true },
                { key: "qty", label: "Quantity", fmt: (v) => num(v, 0) },
                { key: "price", label: "Fill Price", fmt: (v) => `$${num(v, 2)}` },
                { key: "value", label: "Total Value", fmt: (v) => `$${num(v, 2)}` },
              ],
            ),
          );
        }

        // Position close & cancel order handlers
        container.querySelectorAll(".close-pos-btn").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const sym = btn.dataset.sym;
            const qty = Number(btn.dataset.qty);
            try {
              await api.post("/api/trad/order", {
                symbol: sym,
                side: "SELL",
                type: "MARKET",
                qty,
              });
              ctx.toast(`Closed position: ${sym}`);
              renderView();
            } catch (err) {
              ctx.toast(`Close failed: ${err.message}`, true);
            }
          });
        });

        container.querySelectorAll(".cancel-ord-btn").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const orderId = btn.dataset.id;
            try {
              await api.post("/api/trad/cancel", { orderId });
              ctx.toast(`Cancelled order ${orderId}`);
              renderView();
            } catch (err) {
              ctx.toast(`Cancel failed: ${err.message}`, true);
            }
          });
        });

        ctx.setSource(d.source);
      };

      await renderView();
      // Auto-refresh quotes and valuations every 15 seconds
      ctx.every(15e3, () => renderView().catch(() => {}));
    },
  },
];
