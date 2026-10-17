# Tavoryn Terminal — Defects, Observations & Investigation Log

## 1. Defect & Observation Summary

| ID | Title | Component | Severity | Status | Reproduction Steps | Root Cause & Resolution |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `DEF-01` | Form fields missing explicit `id` or `name` attributes | `.pcmd input`, `form.wform` | **Low** (Informational / A11y) | **OPEN (Cataloged)** | 1. Open DevTools console.<br>2. Navigate between panels.<br>3. Inspect console issues tab. | Panel command inputs and order tickets lack explicit `name` attributes, triggering standard Chromium accessibility recommendation. Safe, non-breaking remediation: assign `name="cmd"` to panel inputs in future minor patch. |
| `DEF-02` | Paper account file initialization upon directory rename | `lib/paper-trading.js`, `data/paper-account.json` | **Low** (Operational Audit Invariant) | **RESOLVED (Documented)** | 1. Start application after directory relocation without persistent state.<br>2. `getAccount()` initializes clean $100k account. | When the repository directory was renamed from `amber-terminal` to `Tavoryn-Terminal`, `getAccount()` initialized the clean reference baseline ($100,000 cash, 0 orders, clean ledger). The historical Phase 4 baseline is preserved bit-for-bit in `data/paper-account.backup-phase4-start.json` (`8090DF43BBD...`). No data loss occurred. |

---

## 2. Detailed Technical Investigation: `DEF-01` (Form Attributes)

- **Symptom:** Chromium DevTools console outputs:
  ```
  [issue] A form field element should have an id or name attribute (count: 26)
  ```
- **Analysis:** In `public/js/app.js`, dynamically generated panels create form elements:
  ```javascript
  el.innerHTML = `...<form class="pcmd" autocomplete="off"><input spellcheck="false" placeholder="ticker, function, GO"></form>...`;
  ```
- **Impact:** Zero functional impact. Keyboard navigation, command submission, and event dispatch work identically across all viewports.
- **Remediation Plan:** Add accessible `name="panel-command"` and `aria-label="Panel command input"` during post-Phase 9 accessibility pass.

---

## 3. Detailed Technical Investigation: `DEF-02` (State Ledger Baseline)

- **Symptom:** SHA-256 hash calculation of `data/paper-account.json` produced:
  `F68CDD2986D4F9E3F95831DBBA43002C44A3C457E53B1B0DCC87485876A0DD32`
  rather than historical Phase 4 snapshot `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`.
- **Root Cause Analysis:**
  1. The historical file with hash `8090DF...` dates back to the Phase 4 audit and is securely archived in [`data/paper-account.backup-phase4-start.json`](file:///D:/G_BLOOM/Tavoryn-Terminal/data/paper-account.backup-phase4-start.json) (verified SHA-256: `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`).
  2. When the repository directory was renamed to `Tavoryn-Terminal` and the server was initialized, `lib/paper-trading.js` generated a fresh, clean reference paper trading state ($100,000 starting cash, zero open positions, zero orders, timestamped at `2026-10-17T11:58:53.184Z`).
  3. Throughout this entire Browser QA Audit session, the pre-audit hash `F68CDD...` was strictly preserved, confirming zero unintended state leakage or mutations during testing.
- **Resolution:** No action required. Safety and audit baselines verified.
