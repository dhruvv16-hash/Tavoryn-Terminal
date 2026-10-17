# Tavoryn Terminal — Full Application Browser QA Audit

## Overview

This directory contains the complete artifact bundle, evidence chain, and verification logs for the exhaustive functional Browser QA Audit conducted on **Tavoryn Terminal** (v1.0.0).

The audit was executed against the live application running on local port `3787` (`http://localhost:3787`), utilizing automated browser interaction via Chrome DevTools Protocol (CDP) / Chrome DevTools MCP and deterministic test suites.

## Directory Structure

- `README.md` — This file: audit overview and execution guide.
- `feature-inventory.md` — Comprehensive inventory of all 29 terminal screens, shell components, research engines, and execution interfaces mapped to QA scenarios.
- `test-coverage-matrix.csv` — Granular tabular matrix with test execution outcomes, expected vs actual behavior, and evidence paths.
- `test-summary.md` — Quantitative test results, pass rates, execution metrics, and coverage breakdown.
- `defects.md` — Defect log, severity classifications, reproduction steps, and root-cause analyses.
- `state-integrity.md` — Pre-audit and post-audit SHA-256 accounting verification and safety guarantees.
- `final-qa-report.md` — Executive-level assessment and release sign-off.
- `screenshots/` — High-resolution captured screenshots visually inspected during the audit.
- `logs/` — Sanitized browser console diagnostics and HTTP network logs.

## Audit Execution Commands

1. **Start Application Server:**
   ```powershell
   node server.js
   ```

2. **Run Automated Browser QA Suite:**
   ```powershell
   node --test test/browser-qa.test.js
   ```

3. **Run Full Terminal Regression Suite (572 Unit Tests):**
   ```powershell
   npm test
   ```

4. **Verify Paper Trading Ledger Hash Invariance:**
   ```powershell
   Get-FileHash -Algorithm SHA256 -Path data/paper-account.json
   ```
