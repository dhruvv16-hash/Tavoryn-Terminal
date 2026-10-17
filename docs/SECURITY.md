# Security & Isolation Policy — Tavoryn Terminal

## 1. Network Boundary & Binding
- The HTTP server binds by default strictly to loopback interfaces (`127.0.0.1` and `localhost`).
- It does not expose public internet interfaces unless explicitly overridden by `HOST`.

## 2. Cross-Site Request Forgery (CSRF) & Origin Defense
- State-mutating requests (`POST`, `PUT`, `DELETE`) require a proprietary header (`x-qt: 1`).
- Cross-origin requests from foreign browser tabs are blocked (`403 Forbidden`) via origin validation against the local host.
- Static file resolution is strictly bounded using sanitized path resolution to prevent directory traversal (`..` attacks).

## 3. Credential & Privacy Isolation
- No user passwords, broker logins, or personal identities are collected or transmitted.
- Optional API keys (Alpaca, Polygon) reside solely in the local `data/feeds.json` file.
- The `data/` directory is excluded from version control via `.gitignore`.
