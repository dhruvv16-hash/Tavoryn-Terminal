// Structured Logger with Correlation Identifiers and Secret Redaction
// Protects API keys, tokens, and authorization credentials from leakage in logs.

import crypto from "node:crypto";

const SENSITIVE_KEY_REGEX = /token|secret|password|key|auth|bearer|credential/i;

/**
 * Recursively redacts sensitive values from objects or strings
 */
export function redactSensitiveData(data, depth = 0) {
  if (depth > 6 || data == null) return data;
  if (typeof data === "string") {
    // Redact bearer tokens or api key patterns in strings
    return data
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
      .replace(/key=[A-Za-z0-9._-]+/gi, "key=[REDACTED]")
      .replace(/token=[A-Za-z0-9._-]+/gi, "token=[REDACTED]");
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof data === "object") {
    const redacted = {};
    for (const [k, v] of Object.entries(data)) {
      if (SENSITIVE_KEY_REGEX.test(k)) {
        redacted[k] = "[REDACTED]";
      } else {
        redacted[k] = redactSensitiveData(v, depth + 1);
      }
    }
    return redacted;
  }

  return data;
}

/**
 * Creates a structured log entry with correlation ID and redacted metadata
 */
export function createStructuredLog(level, message, metadata = {}, correlationId = null) {
  const cid = correlationId || `CID-${crypto.randomBytes(4).toString("hex")}`;
  const entry = {
    timestamp: new Date().toISOString(),
    correlationId: cid,
    level: String(level).toUpperCase(),
    message,
    metadata: redactSensitiveData(metadata),
  };
  return entry;
}

export const logger = {
  info: (msg, meta, cid) => createStructuredLog("INFO", msg, meta, cid),
  warn: (msg, meta, cid) => createStructuredLog("WARN", msg, meta, cid),
  error: (msg, meta, cid) => createStructuredLog("ERROR", msg, meta, cid),
  debug: (msg, meta, cid) => createStructuredLog("DEBUG", msg, meta, cid),
};
