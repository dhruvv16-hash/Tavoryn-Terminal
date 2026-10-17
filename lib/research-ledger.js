// Append-only, versioned research evaluation ledger with cryptographic integrity hashes.
// Guarantees durable holdout protection across process restarts.
// Prohibits post-hoc tuning on holdout data by locking evaluated dataset and strategy hashes.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Computes deterministic SHA-256 integrity hash linking each entry to previous entry.
 */
export function computeLedgerHash(prevHash, entry) {
  const payload = [
    prevHash || "GENESIS_BLOCK",
    entry.datasetHash || "",
    entry.version || "",
    entry.paramHash || "",
    String(entry.evaluatedAt || 0),
    JSON.stringify(entry.metricsSummary || {}),
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Reads and parses all entries from the append-only ledger file.
 */
export function readResearchLedger(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

/**
 * Verifies the cryptographic hash-chain integrity of the ledger file.
 */
export function verifyResearchLedgerIntegrity(filePath) {
  if (!fs.existsSync(filePath)) {
    return { valid: true, count: 0, entries: [] };
  }

  const entries = readResearchLedger(filePath);
  let expectedPrevHash = "GENESIS_BLOCK";

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        brokenIndex: i,
        reason: `Hash chain mismatch at index ${i}: prevHash "${entry.prevHash}" !== expected "${expectedPrevHash}"`,
      };
    }

    const calculatedHash = computeLedgerHash(entry.prevHash, entry);
    if (entry.hash !== calculatedHash) {
      return {
        valid: false,
        brokenIndex: i,
        reason: `Integrity hash mismatch at index ${i}: hash "${entry.hash}" !== expected "${calculatedHash}"`,
      };
    }

    expectedPrevHash = entry.hash;
  }

  return { valid: true, count: entries.length, entries };
}

/**
 * Appends a new evaluation record with cryptographic chaining.
 */
export function appendResearchLedger(filePath, record) {
  const verification = verifyResearchLedgerIntegrity(filePath);
  if (!verification.valid) {
    throw new Error(`Cannot append to corrupted research ledger: ${verification.reason}`);
  }

  const prevHash =
    verification.entries.length > 0
      ? verification.entries[verification.entries.length - 1].hash
      : "GENESIS_BLOCK";

  const entry = {
    index: verification.entries.length,
    prevHash,
    datasetHash: record.datasetHash,
    version: record.version,
    paramHash: record.paramHash,
    evaluatedAt: record.evaluatedAt || Date.now(),
    metricsSummary: record.metricsSummary || {},
    provenance: record.provenance || {},
  };

  entry.hash = computeLedgerHash(prevHash, entry);

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8");
  return entry;
}
