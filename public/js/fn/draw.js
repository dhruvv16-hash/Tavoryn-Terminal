// DRAW: Chart Drawings & Technical Price Levels Manager
import { api, esc, num, pct, cls } from "../api.js";
import { table, kv, sect, html } from "../ui.js";

export async function getDrawings(symbol) {
  try {
    const s = await api.get("/api/state");
    const all = s?.tavorynDrawings || s?.amberDrawings || {};
    return all[symbol] || [];
  } catch {
    return [];
  }
}

export async function saveDrawings(symbol, list) {
  try {
    const s = await api.get("/api/state").catch(() => ({}));
    const all = { ...(s?.tavorynDrawings || s?.amberDrawings || {}) };
    all[symbol] = list;
    await api.put("/api/state", { tavorynDrawings: all, amberDrawings: all });
  } catch {}
}

export default [
  {
    id: "DRAW",
    name: "Chart drawings & technical price levels",
    group: "charting",
    needs: true,
    source: "Tavoryn Charting & Technical Drawing State Engine",
    async render(ctx) {
      const sec = ctx.sec;
      if (!sec) {
        ctx.toast("Select a security first, e.g. AAPL US EQUITY DRAW", true);
        return;
      }

      const parts = Array.isArray(ctx.args)
        ? ctx.args
        : String(ctx.args || "").trim().split(/\s+/).filter(Boolean);

      let curQuote = null;
      try {
        const quotes = await api.quotes([sec.id]);
        curQuote = quotes[sec.id]?.price || null;
      } catch {}

      // Handle quick command: DRAW 345 Support or DRAW CLEAR
      if (parts[0]) {
        const cmd = parts[0].toUpperCase();
        if (cmd === "CLEAR") {
          await saveDrawings(sec.id, []);
          ctx.toast(`Cleared drawings for ${sec.ticker || sec.id}`);
        } else if (!isNaN(Number(parts[0]))) {
          const px = Number(parts[0]);
          const label = parts.slice(1).join(" ") || "Technical Level";
          const currentList = await getDrawings(sec.id);
          currentList.push({ price: px, label, color: px >= (curQuote || px) ? "#ff4a4a" : "#2fd36b" });
          await saveDrawings(sec.id, currentList);
          ctx.toast(`Added level $${px} (${label})`);
        }
        ctx.setCmd(`${sec.ticker || sec.id} DRAW`);
      }

      if (!ctx.live()) return;
      ctx.el.innerHTML = "";

      const container = document.createElement("div");
      ctx.el.append(container);

      const renderView = async () => {
        const levels = await getDrawings(sec.id);
        if (!ctx.live()) return;
        container.innerHTML = "";

        // Header info
        container.append(
          html(
            `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">` +
              `<div style="font-size:14px"><b class="amber">${esc(sec.ticker || sec.id)}</b> Technical Levels · Current Price: <b class="amber">${curQuote ? `$${num(curQuote, 2)}` : "—"}</b></div>` +
              `<div><button class="tab active view-chart-btn" style="padding:2px 8px">Open Chart (GP)</button></div>` +
            `</div>`,
          ),
        );

        container.querySelector(".view-chart-btn").addEventListener("click", () => {
          ctx.go(`${sec.ticker || sec.id} GP`);
        });

        // Add Level Form
        container.append(sect("Add Support / Resistance Level"));
        const form = html(
          `<form class="wform" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:12px">` +
            `<input class="lvl-px" type="number" step="any" placeholder="Price (e.g. ${curQuote ? num(curQuote, 2) : "150"})" style="width:130px" required value="${curQuote ? num(curQuote, 2) : ""}">` +
            `<input class="lvl-lbl" placeholder="Label (e.g. Major Support)" style="width:180px" value="Key Level">` +
            `<select class="lvl-color">` +
              `<option value="#2fd36b">Green (Support)</option>` +
              `<option value="#ff4a4a">Red (Resistance)</option>` +
              `<option value="#ffa028" selected>Amber (Pivot)</option>` +
              `<option value="#5aaeff">Blue (Target)</option>` +
            `</select>` +
            `<button type="submit" class="tab active">Add Level</button>` +
            `<button type="button" class="tab lvl-clear" style="margin-left:auto;color:var(--down)">Clear All</button>` +
          `</form>`,
        );
        container.append(form);

        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const pVal = Number(form.querySelector(".lvl-px").value);
          const lVal = form.querySelector(".lvl-lbl").value.trim() || "Technical Level";
          const cVal = form.querySelector(".lvl-color").value;

          if (!Number.isFinite(pVal) || pVal <= 0) {
            ctx.toast("Enter a valid price level", true);
            return;
          }

          levels.push({ price: pVal, label: lVal, color: cVal });
          await saveDrawings(sec.id, levels);
          ctx.toast(`Added level $${pVal}`);
          renderView();
        });

        form.querySelector(".lvl-clear").addEventListener("click", async () => {
          if (confirm(`Clear all saved price levels for ${sec.ticker || sec.id}?`)) {
            await saveDrawings(sec.id, []);
            ctx.toast("Cleared all levels");
            renderView();
          }
        });

        // Table of saved levels
        container.append(sect(`Active Price Levels (${levels.length})`));
        if (!levels.length) {
          container.append(html(`<div class="hint">No drawings or price levels saved for this security yet. Add one above.</div>`));
        } else {
          const rows = levels.map((lvl, idx) => {
            const diff = curQuote ? lvl.price - curQuote : null;
            const diffPct = curQuote ? (diff / curQuote) * 100 : null;
            return {
              idx,
              price: lvl.price,
              label: lvl.label,
              color: lvl.color,
              diff,
              diffPct,
              position: diff == null ? "—" : diff > 0 ? "Resistance (Above)" : diff < 0 ? "Support (Below)" : "At Market",
            };
          });

          container.append(
            table(
              rows,
              [
                { key: "price", label: "Price Level", left: true, fmt: (v) => `$${num(v, 2)}`, lbl: true },
                { key: "label", label: "Annotation / Label", left: true },
                { key: "position", label: "Structure" },
                {
                  key: "diff",
                  label: "Distance ($)",
                  fmt: (v) => (v != null ? `${v > 0 ? "+" : ""}$${num(Math.abs(v), 2)}` : "—"),
                  cls: (v) => cls(v),
                },
                {
                  key: "diffPct",
                  label: "Distance (%)",
                  fmt: (v) => (v != null ? pct(v) : "—"),
                  cls: (v) => cls(v),
                },
                {
                  key: "idx",
                  label: "Action",
                  html: true,
                  fmt: (i) => `<button class="tab del-lvl-btn" data-i="${i}" style="padding:1px 6px;color:var(--down)">Delete</button>`,
                },
              ],
            ),
          );

          container.querySelectorAll(".del-lvl-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const i = Number(btn.dataset.i);
              levels.splice(i, 1);
              await saveDrawings(sec.id, levels);
              ctx.toast("Removed level");
              renderView();
            });
          });
        }
      };

      await renderView();
    },
  },
];
