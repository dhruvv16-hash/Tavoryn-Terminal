// Everything you save (layouts, watchlists, drawings, alerts, paper account) lives in ./data as
// plain JSON files you own. Writes go to a temp file first so a crash can't corrupt them.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

function findStoreRoot() {
  if (process.env.LAMBDA_TASK_ROOT) return process.env.LAMBDA_TASK_ROOT;
  let curr = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(curr, "data"))) return curr;
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  if (fs.existsSync(path.join(process.cwd(), "data"))) return process.cwd();
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
}
const root = findStoreRoot();
export const DATA_DIR =
  process.env.QT_DATA_DIR ||
  (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join(os.tmpdir(), "tavoryn-data")
    : path.join(root, "data"));

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch {}

export function read(name, fallback) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, `${name}.json`), "utf8"),
    );
  } catch {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(root, "data", `${name}.json`), "utf8"),
      );
    } catch {
      return fallback;
    }
  }
}

export function write(name, value) {
  const file = path.join(DATA_DIR, `${name}.json`);
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.floor(Math.random() * 10000)}.tmp`;
  const text = JSON.stringify(value, null, 2);
  fs.writeFileSync(tmp, text);
  let renamed = false;
  // Bounded retry to allow transient Windows file locks (antivirus, search indexer) to release
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(tmp, file);
      renamed = true;
      break;
    } catch (e) {
      if (!["EPERM", "EBUSY", "EACCES"].includes(e.code)) {
        try { fs.rmSync(tmp, { force: true }); } catch {}
        throw e;
      }
      const start = Date.now();
      while (Date.now() - start < 15) {}
    }
  }
  if (!renamed) {
    // If atomic replacement persistently fails after retries, fallback to direct write
    try {
      fs.writeFileSync(file, text);
    } finally {
      try { fs.rmSync(tmp, { force: true }); } catch {}
    }
  }
}
