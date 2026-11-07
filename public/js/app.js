// Tavoryn Terminal: four panels, each with its own command line, plus the global one at the top.
// The global command runs in the active panel. Your layout is saved to the data folder.
import { api, esc, px, pct, cls } from "./api.js";
import { parse, defaultFn, suggestions, securityQuery } from "./commands.js";
import { FUNCS } from "./fn/index.js";
import { lookupList, bbgCode, formatSecurityDisplay } from "./securities.js";
import {
  tableBlocks,
  buildCsv,
  csvName,
  downloadText,
  linkSources,
} from "./ui.js";
import { UserManual } from "./manual.js";
import { startTour } from "./tour.js";
import { AuthGate } from "./auth-ui.js";
import { LoginPage } from "./login-page.js?v=20261108a";
import { getCurrentUser, signOutUser } from "./auth.js";
import { DownloadCenter } from "./download-page.js";

const $ = (s, el = document) => el.querySelector(s);
const grid = $("#grid");
const manualView = $("#manualView");
const downloadView = $("#downloadView");
let manualInstance = null;
let downloadInstance = null;

export function isManualRoute(pathname = window.location.pathname) {
  return pathname === "/help" || pathname === "/user-manual" || pathname === "/manual";
}

export function isDownloadRoute(pathname = window.location.pathname) {
  return pathname === "/download" || pathname === "/downloads" || pathname === "/desktop";
}

export function showManual(push = true) {
  grid.hidden = true;
  if (downloadView) downloadView.hidden = true;
  document.documentElement.classList.remove("route-download");
  if (manualView) manualView.hidden = false;
  if (!manualInstance && manualView) {
    manualInstance = new UserManual(
      manualView,
      (cmd) => {
        showTerminal(true);
        gInput.value = cmd;
        panels[state.active].run(cmd);
      },
      () => showTerminal(true)
    );
  }
  if (push && !isManualRoute()) {
    history.pushState({ view: "manual" }, "", "/user-manual");
  }
}

export function showDownload(push = true) {
  grid.hidden = true;
  if (manualView) manualView.hidden = true;
  if (downloadView) downloadView.hidden = false;
  document.documentElement.classList.add("route-download");
  if (!downloadInstance && downloadView) {
    downloadInstance = new DownloadCenter(
      downloadView,
      () => showTerminal(true)
    );
  }
  if (push && !isDownloadRoute()) {
    history.pushState({ view: "download" }, "", "/download");
  }
}

export function showTerminal(push = true) {
  if (manualView) manualView.hidden = true;
  if (downloadView) downloadView.hidden = true;
  document.documentElement.classList.remove("route-download");
  grid.hidden = false;
  if (push && (isManualRoute() || isDownloadRoute())) {
    history.pushState({ view: "grid" }, "", "/");
  }
  gInput.focus();
}

window.addEventListener("popstate", () => {
  if (isDownloadRoute()) showDownload(false);
  else if (isManualRoute()) showManual(false);
  else showTerminal(false);
});

const LAYOUTS = { 1: "one", 2: "two", 4: "", 6: "six", 8: "eight" };
const DEFAULT = [
  "WEI",
  "TOP",
  "SPX INDEX GP",
  "ECO",
  "GC",
  "OMON",
  "FA",
  "PORT",
];

let state = { layout: 4, panels: DEFAULT.slice(), active: 0 };
const panels = [];
let saveTimer;
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () => {
      const payload = {
        layout: state.layout,
        panels: panels.map((p) => p.cmd),
        active: state.active,
      };
      api
        .put("/api/state", {
          tavoryn: payload,
          amber: payload,
        })
        .catch(() => {});
    },
    500,
  );
};

export function toast(msg, err = false, ms = 4500) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast${err ? " err" : ""}`;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), ms);
}

class Panel {
  constructor(i) {
    this.i = i;
    this.cmd = "";
    this.sec = null;
    this.history = [];
    this.cleanups = [];
    const el = document.createElement("section");
    el.className = "panel";
    el.innerHTML = `<div class="pbar"><span class="pnum">${i + 1}</span><form class="pcmd" autocomplete="off"><input spellcheck="false" placeholder="ticker, function, GO"></form><button class="pbtn" data-a="export" title="Download every table on this screen as one CSV file, for Excel">Export</button><button class="pbtn" data-a="back" title="Back (Esc)">◂</button><button class="pbtn" data-a="max" title="Full screen">▢</button></div><div class="ptitle"><span class="fn"></span><span class="sec"></span></div><div class="pbody"></div><div class="pfoot"><span class="src"></span><span class="asof"></span></div>`;
    this.el = el;
    this.input = $("input", el);
    this.body = $(".pbody", el);
    $("form", el).onsubmit = (e) => {
      e.preventDefault();
      hideSuggest();
      this.run(this.input.value);
    };
    this.input.addEventListener("input", () => showSuggest(this.input));
    this.input.addEventListener("keydown", (e) => suggestKeys(e, this.input));
    el.addEventListener("mousedown", () => setActive(this.i));
    $('[data-a="back"]', el).onclick = () => this.back();
    $('[data-a="export"]', el).onclick = () => this.exportCsv();
    $('[data-a="max"]', el).onclick = () => el.classList.toggle("max");
    $(".ptitle", el).ondblclick = () => el.classList.toggle("max");
  }

  // Every table on the screen, one CSV file, named <FUNCTION>-<security>-<date>.csv.
  exportCsv() {
    const blocks = tableBlocks(this.body);
    if (!blocks.length)
      return toast(
        "This screen has no tables to export. HP shows a price history as a table.",
        true,
      );
    const sec = this.subject ? bbgCode(this.subject) : "";
    const heading = `${this.fn} ${this.fname}${sec ? `, ${sec}` : ""}, exported ${new Date().toLocaleString()}`;
    downloadText(
      csvName(this.fn, sec),
      buildCsv(blocks, {
        heading,
        footer: this.srcText ? `Source: ${this.srcText}` : "",
      }),
    );
    toast(
      `Exported ${blocks.length} table${blocks.length > 1 ? "s" : ""} to ${csvName(this.fn, sec)}`,
    );
  }

  back() {
    this.history.pop();
    const prev = this.history.pop();
    if (prev) this.run(prev);
  }

  async run(input, { push = true } = {}) {
    const p = parse(input);
    if (!p) return;
    let { fn, sec, args } = p;
    if (sec) this.sec = sec;
    if (!fn) fn = defaultFn(this.sec);
    const f = FUNCS[fn];
    if (!f)
      return toast(`No function called ${fn}. Type HELP for the list.`, true);
    if (f.needs && !this.sec)
      return toast(
        `${fn} needs a security first, for example AAPL US EQUITY ${fn}.`,
        true,
      );
    const subject = f.needs ? this.sec : null;
    Object.assign(this, { fn, fname: f.name, subject, srcText: "" });
    this.cmd = `${subject ? `${subject.raw} ` : ""}${fn}${args.length ? ` ${args.join(" ")}` : ""}`;
    if (push) this.history.push(this.cmd);
    if (this.history.length > 50) this.history.shift();
    this.input.value = "";
    this.input.placeholder = this.cmd;
    for (const c of this.cleanups.splice(0))
      try {
        c();
      } catch {}
    $(".fn", this.el).textContent = `${fn}  ${f.name}`;
    const disp = subject ? formatSecurityDisplay(subject) : null;
    $(".sec", this.el).textContent = disp ? (disp.name ? `${disp.symbol} (${disp.name})` : disp.symbol) : "";
    $(".src", this.el).textContent = "";
    $(".asof", this.el).textContent = "";
    this.body.innerHTML = `<div class="loading">Loading ${esc(f.name)}</div>`;
    const token = (this.token = {});
    const ctx = {
      el: this.body,
      sec: subject,
      args,
      named: !!sec,
      panel: this,
      live: () => token === this.token,
      setSource: (src) => {
        this.srcText = String(src ?? "");
        const s = $(".src", this.el);
        s.innerHTML = linkSources(this.srcText);
        s.title = this.srcText;
        $(".asof", this.el).textContent =
          `as of ${new Date().toLocaleTimeString()}`;
      },
      setTitle: (t) => ($(".sec", this.el).textContent = t),
      go: (c) => this.run(c),
      // A screen that edits something (W ADD NVDA) leaves the plain command behind, so a reload doesn't repeat it.
      setCmd: (c) => {
        if (token !== this.token) return;
        this.cmd = c;
        this.history[this.history.length - 1] = c;
        this.input.placeholder = c;
        save();
      },
      toast,
      onCleanup: (fn2) => this.cleanups.push(fn2),
      every: (ms, fn2) => {
        const id = setInterval(() => token === this.token && fn2(), ms);
        this.cleanups.push(() => clearInterval(id));
      },
    };
    try {
      await f.render(ctx);
    } catch (e) {
      if (token === this.token)
        this.body.innerHTML = `<div class="err">${esc(e.message)}</div><div class="hint">Type HELP for functions, or DATA to see where each screen's data comes from.</div>`;
    }
    save();
  }
}

function setActive(i) {
  state.active = i;
  panels.forEach((p, j) => p.el.classList.toggle("active", i === j));
}

function setLayout(n) {
  state.layout = n;
  grid.className = `grid ${LAYOUTS[n] ?? ""}`;
  panels.forEach((p, j) => (p.el.style.display = j < n ? "" : "none"));
  if (state.active >= n) setActive(0);
  document.querySelectorAll("#keys button[data-l]").forEach((b) => {
    b.classList.toggle("active", +b.dataset.l === n);
  });
  save();
}

// ---------- autocomplete: securities (Bloomberg's SECF) above functions ----------
let sugIdx = -1;
let secTimer;
const secCache = new Map();
const secHtml = (code) => {
  const w = code.split(" ");
  return `${esc(w.slice(0, -1).join(" "))} <i class="yk">${esc(w.at(-1))}</i>`;
};
function showSuggest(input, keep = false) {
  const box = $("#suggest");
  if (!keep) sugIdx = -1;
  const sq = securityQuery(input.value);
  clearTimeout(secTimer);
  if (sq && !secCache.has(sq.query))
    secTimer = setTimeout(() => lookup(input, sq.query), 200);
  const secs = sq ? secCache.get(sq.query) || lookupList([], sq.query) : [];
  const funcs = suggestions(input.value).slice(0, secs.length ? 6 : 12);
  // Nothing to show yet: close the box but keep the pending lookup.
  if ((!secs.length && !funcs.length) || !input.value.trim())
    return void ($("#suggest").hidden = true);
  const r = input.getBoundingClientRect();
  box.style.left = `${r.left}px`;
  box.style.top = `${r.bottom + 2}px`;
  box.innerHTML =
    secs
      .map(
        (s) =>
          `<div class="secrow" data-sec="${esc(s.code)}"><b>${secHtml(s.code)}</b><span>${esc(s.name)}</span></div>`,
      )
      .join("") +
    funcs
      .map(
        (f) =>
          `<div data-id="${f.id}"><b>${f.id}</b><span>${esc(f.name)}</span></div>`,
      )
      .join("");
  [...box.children].forEach((d, i) => d.classList.toggle("sel", i === sugIdx));
  box.hidden = false;
  box.onmousedown = (e) => {
    const d = e.target.closest("[data-id],[data-sec]");
    if (!d) return;
    e.preventDefault();
    pick(input, d);
  };
}
// Debounced lookup against /api/search; a stale answer for words no longer being typed is dropped.
async function lookup(input, q) {
  let res = [];
  try {
    res = await api.get(`/api/search?q=${encodeURIComponent(q)}`);
  } catch {}
  secCache.set(q, lookupList(res, q));
  if (secCache.size > 200) secCache.delete(secCache.keys().next().value);
  if (
    document.activeElement === input &&
    securityQuery(input.value)?.query === q
  )
    showSuggest(input, true);
}
function hideSuggest() {
  $("#suggest").hidden = true;
  sugIdx = -1;
  clearTimeout(secTimer);
}
// A function replaces the word being typed; a security replaces the words of the name ("bank of am").
function pick(input, d) {
  const words = input.value.trim().split(/\s+/);
  if (d.dataset.sec) {
    const sq = securityQuery(input.value);
    input.value = `${[...words.slice(0, sq ? sq.start : words.length - 1), d.dataset.sec].join(" ")} `;
  } else {
    words[words.length - 1] = d.dataset.id;
    input.value = `${words.join(" ")} `;
  }
  hideSuggest();
  input.focus();
}
function suggestKeys(e, input) {
  const box = $("#suggest");
  if (e.key === "Escape") {
    if (!box.hidden) return hideSuggest();
    const p = panels[state.active];
    if (input !== $("#gInput") || p) p?.back();
    return;
  }
  if (box.hidden) return;
  const items = [...box.children];
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    sugIdx =
      (sugIdx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items.forEach((d, i) => d.classList.toggle("sel", i === sugIdx));
    items[sugIdx]?.scrollIntoView({ block: "nearest" });
  } else if (e.key === "Tab" && items.length) {
    e.preventDefault();
    pick(input, items[Math.max(0, sugIdx)]);
  } else if (e.key === "Enter" && sugIdx >= 0) {
    e.preventDefault();
    pick(input, items[sugIdx]);
  }
}

// ---------- top bar ----------
const gInput = $("#gInput");
$("#globalCmd").onsubmit = (e) => {
  e.preventDefault();
  hideSuggest();
  const v = gInput.value.trim();
  if (!v) return;
  if (/^(HELP|MANUAL|USER-MANUAL)$/i.test(v)) {
    showManual(true);
    gInput.value = "";
    return;
  }
  if (/^(DOWNLOAD|DOWNLOADS|DESKTOP|APP)$/i.test(v)) {
    showDownload(true);
    gInput.value = "";
    return;
  }
  const themeCmd = /^(THEME|LIGHT|DARK|DAY|NIGHT)(\s+(LIGHT|DARK|TOGGLE))?$/i.exec(v);
  if (themeCmd) {
    const kw = themeCmd[1].toUpperCase();
    const sub = themeCmd[3]?.toUpperCase();
    if (kw === "LIGHT" || kw === "DAY" || sub === "LIGHT") {
      setTheme("light");
      toast("THEME: LIGHT (DAYLIGHT TITANIUM) ACTIVATED");
    } else if (kw === "DARK" || kw === "NIGHT" || sub === "DARK") {
      setTheme("dark");
      toast("THEME: DARK (CRT OBSIDIAN) ACTIVATED");
    } else {
      toggleTheme();
    }
    gInput.value = "";
    return;
  }
  showTerminal(true);
  const n = /^(LAYOUT|GRID)\s+([12468])$/i.exec(v);
  if (n) setLayout(+n[2]);
  else panels[state.active].run(v);
  gInput.value = "";
};
gInput.addEventListener("input", () => showSuggest(gInput));
gInput.addEventListener("keydown", (e) => suggestKeys(e, gInput));

const helpLink = $("#helpLink");
if (helpLink) {
  helpLink.onclick = (e) => {
    e.preventDefault();
    showManual(true);
  };
}

const brandLogo = $("#brandLogo");
if (brandLogo) {
  brandLogo.onclick = () => showTerminal(true);
}

const downloadTopBtn = $("#downloadTopBtn");
const downloadPopover = $("#downloadPopover");

function toggleDownloadPopover() {
  if (!downloadPopover) return;
  if (downloadPopover.hidden) {
    downloadPopover.innerHTML = `
      <div class="user-popover-card download-popover-card">
        <div class="user-popover-header">
          <div class="user-popover-avatar" style="background:#ffb000;color:#0c0d0e;font-weight:900;display:flex;align-items:center;justify-content:center;font-size:11px;">TT</div>
          <div class="user-popover-info">
            <div class="user-popover-name" style="color:#ffb000;font-weight:700;">Tavoryn Terminal Desktop</div>
            <div class="user-popover-email">v1.0.0 · Native Standalone</div>
          </div>
        </div>
        <div class="user-popover-meta" style="margin:10px 0;font-size:11px;color:#94a3b8;line-height:1.4;">
          Sub-15ms local calculation engine. Zero Node.js install required. Persistent AppData ledger.
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <a href="/api/download?platform=windows-exe" class="popover-btn primary" style="text-align:center;text-decoration:none;display:block;" download>
            <span>Windows Setup (.exe) — 77 MB</span>
          </a>
          <a href="/api/download?platform=windows-msi" class="popover-btn secondary" style="text-align:center;text-decoration:none;display:block;" download>
            <span>Windows MSI Package (.msi) — 90 MB</span>
          </a>
          <a href="/api/download?platform=macos-arm64" class="popover-btn secondary" style="text-align:center;text-decoration:none;display:block;" download>
            <span>macOS Apple Silicon (.dmg)</span>
          </a>
          <a href="/api/download?platform=macos-x64" class="popover-btn secondary" style="text-align:center;text-decoration:none;display:block;" download>
            <span>macOS Intel x64 (.dmg)</span>
          </a>
          <a href="/api/download?platform=linux-appimage" class="popover-btn secondary" style="text-align:center;text-decoration:none;display:block;" download>
            <span>Linux Universal (.AppImage) — 82 MB</span>
          </a>
          <a href="/api/download?platform=linux-deb" class="popover-btn secondary" style="text-align:center;text-decoration:none;display:block;" download>
            <span>Linux Debian / Ubuntu (.deb) — 71 MB</span>
          </a>
          <a href="/download" id="popoverDownloadCenterBtn" class="popover-btn" style="text-align:center;text-decoration:none;display:block;background:rgba(255,176,0,0.12);color:#ffb000;border:1px solid #ffb000;margin-top:6px;font-weight:700;">
            <span>Open Download Center (/download) →</span>
          </a>
        </div>
      </div>
    `;
    const dlCenterBtn = downloadPopover.querySelector("#popoverDownloadCenterBtn");
    if (dlCenterBtn) {
      dlCenterBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        downloadPopover.hidden = true;
        showDownload(true);
      });
    }
    downloadPopover.hidden = false;
  } else {
    downloadPopover.hidden = true;
  }
}

if (downloadTopBtn) {
  downloadTopBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDownloadPopover();
  });
}

document.addEventListener("click", (e) => {
  if (
    downloadPopover &&
    !downloadPopover.hidden &&
    !downloadPopover.contains(e.target) &&
    e.target !== downloadTopBtn &&
    !downloadTopBtn?.contains(e.target)
  ) {
    downloadPopover.hidden = true;
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && downloadPopover && !downloadPopover.hidden) {
    downloadPopover.hidden = true;
  }
});

// The yellow keys sit on the F-keys of a Bloomberg keyboard: F2 GOVT, F8 EQUITY, F9 CMDTY, F10 INDEX, F11 CRNCY.
const FKEYS = {
  F2: "GOVT",
  F8: "EQUITY",
  F9: "CMDTY",
  F10: "INDEX",
  F11: "CRNCY",
};
const fkeyOf = Object.fromEntries([
  ...Object.entries(FKEYS).map(([f, k]) => [k, f]),
  ["HELP", "F1"],
]);
const KEYS = [
  ["GOVT", "y"],
  ["EQUITY", "y"],
  ["CMDTY", "y"],
  ["INDEX", "y"],
  ["CRNCY", "y"],
  ["WEI"],
  ["TOP"],
  ["ECO"],
  ["GC"],
  ["BTMM"],
  ["WIRP"],
  ["FXC"],
  ["GLCO"],
  ["CRYPTO"],
  ["MOST"],
  ["EQS"],
  ["SCRN"],
  ["W"],
  ["ALRT"],
  ["TRAD"],
  ["ASKB"],
  ["HELP"],
  ["DATA"],
];
$("#keys").innerHTML =
  KEYS.filter(([k, y]) => y || FUNCS[k])
    .map(
      ([k, y]) =>
        `<button class="key ${y ? "" : "fn"}" data-k="${k}"${fkeyOf[k] ? ` title="${fkeyOf[k]} on the keyboard"` : ""}>${fkeyOf[k] ? `<small>${fkeyOf[k]}</small>` : ""}${k}</button>`,
    )
    .join("") +
  `<span style="flex:1"></span><button class="key fn" data-l="1">1</button><button class="key fn" data-l="2">2</button><button class="key fn" data-l="4">4</button><button class="key fn" data-l="6">6</button><button class="key fn" data-l="8">8</button>`;
$("#keys").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.l) return setLayout(+b.dataset.l);
  const k = b.dataset.k;
  if (b.classList.contains("fn")) panels[state.active].run(k);
  else {
    gInput.value = `${gInput.value.trim()} ${k} `.trimStart();
    gInput.focus();
  }
};

function clocks() {
  const z = [
    ["NY", "America/New_York"],
    ["LDN", "Europe/London"],
    ["TKY", "Asia/Tokyo"],
  ];
  $("#clocks").innerHTML = z
    .map(
      ([n, tz]) =>
        `${n} <b>${new Date().toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" })}</b>`,
    )
    .join(" ");
}
clocks();
setInterval(clocks, 15e3);

// Ticker tape: the big indices, gold, oil, the dollar and bitcoin, in one request.
const TAPE = [
  ["SPX", "^GSPC"],
  ["NDX", "^NDX"],
  ["INDU", "^DJI"],
  ["UKX", "^FTSE"],
  ["DAX", "^GDAXI"],
  ["NKY", "^N225"],
  ["HSI", "^HSI"],
  ["GOLD", "GC=F"],
  ["WTI", "CL=F"],
  ["US10Y", "^TNX"],
  ["EURUSD", "EURUSD=X"],
  ["USDJPY", "JPY=X"],
  ["BTC", "BTC-USD"],
  ["ETH", "ETH-USD"],
];
async function tape() {
  try {
    const { rows } = await api.fn("board", {
      symbols: TAPE.map(([, s]) => s).join(","),
    });
    const run = TAPE.map(([n, s]) => {
      const r = rows[s] || {};
      return `<span><b>${n}</b>${px(r.price)} <span class="${cls(r.changePct)}">${pct(r.changePct)}</span></span>`;
    }).join("");
    $("#tape").innerHTML = run + run;
  } catch {}
}
tape();
setInterval(tape, 60e3);

// Alerts fire on the server (ALRT); the event stream brings them here as a toast and a desktop notification.
function listenForAlerts() {
  if (!window.EventSource) return;
  const es = new EventSource("/api/events");
  es.addEventListener("alert", (e) => {
    let a;
    try {
      a = JSON.parse(e.data);
    } catch {
      return;
    }
    toast(a.text, false, 12e3);
    try {
      if (window.Notification?.permission === "granted")
        new Notification("Tavoryn Terminal alert", { body: a.text });
    } catch {}
    window.dispatchEvent(new CustomEvent("tavoryn:alert", { detail: a }));
    window.dispatchEvent(new CustomEvent("amber:alert", { detail: a }));
  });
}
listenForAlerts();

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && manualView && !manualView.hidden) {
    e.preventDefault();
    showTerminal(true);
    return;
  }
  if (e.key === "Escape" && downloadView && !downloadView.hidden) {
    e.preventDefault();
    showTerminal(true);
    return;
  }
  if (FKEYS[e.key] && !e.metaKey && !e.ctrlKey && !e.altKey) {
    // A yellow key goes on the end of the command line being typed in (the top bar if none is).
    e.preventDefault();
    const a = document.activeElement;
    const input = a?.matches?.("#gInput, .pcmd input") ? a : gInput;
    input.value = `${input.value.trim()} ${FKEYS[e.key]} `.trimStart();
    input.focus();
    hideSuggest();
  } else if (e.key === "F1") {
    e.preventDefault();
    hideSuggest();
    showManual(true);
  } else if ((e.metaKey || e.ctrlKey) && /^[1-8]$/.test(e.key)) {
    e.preventDefault();
    const i = +e.key - 1;
    if (i < state.layout) {
      setActive(i);
      panels[i].input.focus();
    }
  } else if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
    e.preventDefault();
    gInput.focus();
  }
});

// ---------- start ----------
for (let i = 0; i < 8; i++) {
  const p = new Panel(i);
  panels.push(p);
  grid.append(p.el);
}
try {
  const res = await api.get("/api/state");
  const s = res?.tavoryn || res?.amber;
  if (s?.panels && Array.isArray(s.panels))
    state = { layout: s.layout || 4, panels: s.panels, active: s.active || 0 };
} catch {}
setLayout(state.layout || 4);
setActive(state.active || 0);
panels.forEach((p, i) => p.run(state.panels[i] || DEFAULT[i]));
if (isDownloadRoute()) {
  showDownload(false);
} else if (isManualRoute()) {
  showManual(false);
} else {
  showTerminal(false);
}
gInput.focus();

const tourBtn = $("#tourBtn");
if (tourBtn) {
  tourBtn.onclick = () => {
    showTerminal(true);
    startTour(true);
  };
}

// ---------- theme manager ----------
export function getTheme() {
  return localStorage.getItem("tavoryn:theme") === "light" ? "light" : "dark";
}

export function updateThemeButtons() {
  const isLight = getTheme() === "light";
  const btn = document.getElementById("themeToggleBtn");
  if (btn) {
    btn.textContent = isLight ? "☾ DARK" : "☀ LIGHT";
    btn.title = isLight ? "Switch to Dark CRT Phosphor Mode" : "Switch to Daylight Titanium Light Mode";
  }
  const loginBtn = document.getElementById("loginThemeToggleBtn");
  if (loginBtn) {
    loginBtn.textContent = isLight ? "☾ DARK" : "☀ LIGHT";
    loginBtn.title = isLight ? "Switch to Dark CRT Phosphor Mode" : "Switch to Daylight Titanium Light Mode";
  }
}

export function setTheme(theme) {
  const isLight = theme === "light";
  if (isLight) {
    document.documentElement.classList.add("theme-light");
    document.body.classList.add("theme-light");
    localStorage.setItem("tavoryn:theme", "light");
  } else {
    document.documentElement.classList.remove("theme-light");
    document.body.classList.remove("theme-light");
    localStorage.setItem("tavoryn:theme", "dark");
  }
  updateThemeButtons();
  window.dispatchEvent(new CustomEvent("tavoryn:theme", { detail: { theme: isLight ? "light" : "dark" } }));
  // Re-run current screens across panels to update any charts with the new theme colors
  panels.forEach((p, i) => {
    if (p.currentScreen) {
      p.run(p.input?.value || state.panels[i] || DEFAULT[i], { push: false });
    }
  });
}

export function toggleTheme() {
  const current = getTheme();
  const next = current === "light" ? "dark" : "light";
  setTheme(next);
  toast(`THEME SET TO ${next.toUpperCase()} MODE`);
  return next;
}

const themeToggleBtn = $("#themeToggleBtn");
if (themeToggleBtn) {
  themeToggleBtn.onclick = () => {
    toggleTheme();
  };
}
updateThemeButtons();

// Dedicated Login Front Page & Auth Gate
const loginPage = new LoginPage();
const authGate = new AuthGate();

if (!isManualRoute() && !isDownloadRoute()) {
  const u = getCurrentUser();
  if (u) {
    const id = u.uid || u.email || u.phoneNumber;
    let toured = {};
    try {
      toured = JSON.parse(localStorage.getItem("tavoryn:toured_accounts") || "{}");
    } catch {}
    if (id && !toured[id]) {
      toured[id] = Date.now();
      try {
        localStorage.setItem("tavoryn:toured_accounts", JSON.stringify(toured));
        localStorage.setItem("tavoryn:tour_completed", "true");
      } catch {}
    }
  }
}

window.tavoryn = window.amber = {
  panels,
  run: (c, i = state.active) => panels[i].run(c),
  showManual,
  showDownload,
  showTerminal,
  isManualRoute,
  isDownloadRoute,
  startTour,
  loginPage,
  authGate,
  getCurrentUser,
  signOutUser,
  getTheme,
  setTheme,
  toggleTheme,
};
