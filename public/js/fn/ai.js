// ASKB / AI: In-Terminal Financial Intelligence Assistant
import { api, esc } from "../api.js";
import { sect, html } from "../ui.js";

function renderMarkdown(md) {
  return String(md || "")
    .replace(/^### (.*$)/gim, '<h3 style="color:var(--amber);margin:6px 0 4px 0;font-size:14px">$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4 style="color:var(--white);margin:4px 0 2px 0;font-size:13px">$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<b style="color:var(--amber)">$1</b>')
    .replace(/\*(.*?)\*/g, '<i style="color:var(--white)">$1</i>')
    .replace(/`([^`]+)`/g, '<code style="background:#161616;padding:1px 4px;border:1px solid #333;color:var(--amber);border-radius:2px">$1</code>')
    .replace(/^\> (.*$)/gim, '<blockquote style="border-left:2px solid var(--amber);padding-left:8px;margin:4px 0;color:var(--dim)">$1</blockquote>')
    .replace(/^\- (.*$)/gim, '<div style="margin:2px 0;padding-left:12px;position:relative"><span style="position:absolute;left:2px;color:var(--amber)">•</span>$1</div>')
    .replace(/\n\n/g, '<div style="height:6px"></div>');
}

export default [
  {
    id: "ASKB",
    name: "AI financial intelligence assistant",
    group: "assistant",
    source: "Tavoryn Intelligence · Live Market Synthesis & Analytical Knowledgebase",
    async render(ctx) {
      const parts = Array.isArray(ctx.args)
        ? ctx.args
        : String(ctx.args || "").trim().split(/\s+/).filter(Boolean);
      const initialQuery = parts.join(" ");

      if (!ctx.live()) return;
      ctx.el.innerHTML = "";

      const root = document.createElement("div");
      root.style.cssText = "display:flex;flex-direction:column;height:100%;box-sizing:border-box;padding-bottom:4px;";
      ctx.el.append(root);

      const stream = document.createElement("div");
      stream.style.cssText = "flex:1;overflow-y:auto;padding-right:4px;margin-bottom:8px;";
      root.append(stream);

      const appendMessage = (sender, content, related = []) => {
        const isUser = sender === "user";
        const msg = document.createElement("div");
        msg.style.cssText = `margin-bottom:10px;padding:8px 10px;border-left:3px solid ${isUser ? "var(--dim)" : "var(--amber)"};background:#0a0a0a;border-radius:2px;`;

        const time = new Date().toLocaleTimeString();
        let header = `<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--dim);margin-bottom:4px">` +
          `<b>${isUser ? "YOU" : "TAVORYN INTELLIGENCE"}</b><span>${time}</span>` +
          `</div>`;

        let body = isUser ? `<div style="color:var(--white);font-size:13px">${esc(content)}</div>` : `<div style="font-size:12px;line-height:1.45">${renderMarkdown(content)}</div>`;

        let actions = "";
        if (related && related.length) {
          const btns = related.map((f) => `<button class="tab" data-f="${esc(f.code)}" style="padding:2px 8px;margin-right:6px;margin-top:6px;border-color:#333"><b class="amber">${esc(f.code)}</b> ${esc(f.name)}</button>`).join("");
          actions = `<div style="margin-top:8px;border-top:1px solid #1a1a1a;padding-top:6px"><span class="dim" style="font-size:11px">Recommended Functions:</span><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${btns}</div></div>`;
        }

        msg.innerHTML = header + body + actions;

        msg.querySelectorAll("button[data-f]").forEach((b) => {
          b.addEventListener("click", () => {
            ctx.go(b.dataset.f);
          });
        });

        stream.append(msg);
        stream.scrollTop = stream.scrollHeight;
      };

      // Top Quick Prompts
      const quickContainer = document.createElement("div");
      quickContainer.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;";
      root.insertBefore(quickContainer, stream);

      const form = html(
        `<form style="display:flex;gap:6px;align-items:center;margin-top:auto">` +
          `<input class="ask-input" placeholder="Ask about markets, macro rates, securities, or terminal commands..." style="flex:1" required spellcheck="false">` +
          `<button type="submit" class="tab active" style="font-weight:bold;padding:4px 12px">ASK</button>` +
        `</form>`,
      );
      root.append(form);

      const input = form.querySelector(".ask-input");

      const handleQuery = async (qText) => {
        if (!qText.trim()) return;
        appendMessage("user", qText);
        input.value = "";

        const tempId = document.createElement("div");
        tempId.className = "loading";
        tempId.textContent = "Analyzing market intelligence...";
        stream.append(tempId);
        stream.scrollTop = stream.scrollHeight;

        try {
          const res = await api.get(`/api/fn/askb?q=${encodeURIComponent(qText)}`);
          tempId.remove();
          appendMessage("assistant", res.answer, res.relatedFunctions);
          ctx.setSource(res.source);
        } catch (e) {
          tempId.remove();
          appendMessage("assistant", `Error querying intelligence engine: ${e.message}`);
        }
      };

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        handleQuery(input.value);
      });

      // Load initial intelligence report
      try {
        const init = await api.get(`/api/fn/askb${initialQuery ? `?q=${encodeURIComponent(initialQuery)}` : ""}`);
        if (!ctx.live()) return;

        // Render quick prompt chips
        quickContainer.innerHTML = `<span class="dim" style="font-size:11px">Topics:</span> ` +
          (init.quickPrompts || []).map((p) => `<button class="tab" data-q="${esc(p.query)}" style="padding:1px 6px;font-size:11px">${esc(p.label)}</button>`).join(" ");

        quickContainer.querySelectorAll("button[data-q]").forEach((btn) => {
          btn.addEventListener("click", () => {
            handleQuery(btn.dataset.q);
          });
        });

        if (initialQuery) {
          appendMessage("user", initialQuery);
        }
        appendMessage("assistant", init.answer, init.relatedFunctions);
        ctx.setSource(init.source);
      } catch (err) {
        if (!ctx.live()) return;
        appendMessage("assistant", `Failed to initialize financial assistant: ${err.message}`);
      }
    },
  },
];
