// Single Execution Ownership & Cross-Process Locking
// Prevents multiple application processes from simultaneously controlling the same brokerage account.
// Enforces fail-closed single execution owner pattern with dead-process lease reclamation.

import fs from "node:fs";
import path from "node:path";

export class ExecutionOwnershipError extends Error {
  constructor(message, lockInfo = null) {
    super(message);
    this.name = "ExecutionOwnershipError";
    this.code = "EXECUTION_OWNERSHIP_LOCKED";
    this.lockInfo = lockInfo;
  }
}

export class ExecutionOwnershipLock {
  constructor(lockPath, options = {}) {
    if (!lockPath) throw new Error("ExecutionOwnershipLock requires a lockPath");
    this.lockPath = lockPath;
    this.processId = options.processId || process.pid;
    this.ownerId = options.ownerId || `PROC-${this.processId}-${Date.now()}`;
    this.leaseTimeoutMs = options.leaseTimeoutMs || 30000; // 30s lease timeout
    this.isHeld = false;
    this.lastHeartbeatTime = 0;
    this._heartbeatTimer = null;
    this.fencingToken = options.fencingToken || 1;
  }

  getFencingToken() {
    return this.fencingToken;
  }

  isProcessAlive(pid) {
    if (!pid || typeof pid !== "number") return false;
    try {
      // Sending signal 0 checks for process existence without killing it
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return false; // ESRCH or error means process is not running
    }
  }

  acquire() {
    if (this.isHeld) return true;

    const dir = path.dirname(this.lockPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const lockData = {
      ownerId: this.ownerId,
      processId: this.processId,
      acquiredAt: Date.now(),
      heartbeatAt: Date.now(),
      fencingToken: this.fencingToken,
    };
    const payload = JSON.stringify(lockData, null, 2);

    // 1. Attempt atomic creation using OS 'wx' flag (O_CREAT | O_EXCL)
    try {
      const fd = fs.openSync(this.lockPath, "wx");
      try {
        fs.writeFileSync(fd, payload, "utf8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      this.isHeld = true;
      this.lastHeartbeatTime = Date.now();
      return true;
    } catch (err) {
      if (err.code !== "EEXIST") {
        // Any other I/O error (EACCES, EBUSY, EPERM) must fail closed
        throw new Error(`Execution lock acquisition failed due to I/O error: ${err.message}`);
      }
    }

    // 2. Lock file already exists (EEXIST). Inspect existing lock file.
    let existing = null;
    try {
      const content = fs.readFileSync(this.lockPath, "utf8");
      existing = JSON.parse(content);
    } catch (readErr) {
      if (readErr.code === "ENOENT") {
        // Unlinked concurrently: retry atomic acquisition once
        return this.acquire();
      }
      // If corrupted or unreadable, check file modification time
      try {
        const stat = fs.statSync(this.lockPath);
        const age = Date.now() - stat.mtimeMs;
        if (age < this.leaseTimeoutMs) {
          throw new ExecutionOwnershipError(
            `Execution lock file exists but unreadable and within lease timeout (${age}ms < ${this.leaseTimeoutMs}ms)`,
          );
        }
      } catch (statErr) {
        if (statErr instanceof ExecutionOwnershipError) throw statErr;
        throw new Error(`Execution lock inspection failed: ${readErr.message}`);
      }
    }

    if (existing) {
      // If lock belongs to this exact instance, already held
      if (existing.ownerId === this.ownerId) {
        this.isHeld = true;
        this.lastHeartbeatTime = Date.now();
        return true;
      }

      // Check process liveness AND lease expiration (guards against dead processes and PID reuse)
      const lastActive = existing.heartbeatAt || existing.acquiredAt || 0;
      const leaseAge = Date.now() - lastActive;
      const isLeaseExpired = leaseAge > this.leaseTimeoutMs;
      const isAlive = this.isProcessAlive(existing.processId);

      // If active process AND lease has not expired: REJECT
      if (isAlive && !isLeaseExpired) {
        throw new ExecutionOwnershipError(
          `Execution ownership is already held by active process PID ${existing.processId} (${existing.ownerId})`,
          existing,
        );
      }
    }

    // 3. Stale or dead process lock: reclaim by unlinking then re-attempting atomic acquisition
    if (existing) {
      this.fencingToken = (Number(existing.fencingToken) || 1) + 1;
    }
    const reclaimData = {
      ownerId: this.ownerId,
      processId: this.processId,
      acquiredAt: Date.now(),
      heartbeatAt: Date.now(),
      fencingToken: this.fencingToken,
    };
    const reclaimPayload = JSON.stringify(reclaimData, null, 2);

    try {
      fs.unlinkSync(this.lockPath);
    } catch (unlinkErr) {
      if (unlinkErr.code !== "ENOENT") {
        throw new Error(`Failed to reclaim stale execution lock: ${unlinkErr.message}`);
      }
    }

    try {
      const fd = fs.openSync(this.lockPath, "wx");
      try {
        fs.writeFileSync(fd, reclaimPayload, "utf8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      this.isHeld = true;
      this.lastHeartbeatTime = Date.now();
      return true;
    } catch (err) {
      if (err.code === "EEXIST") {
        throw new ExecutionOwnershipError(
          "Execution ownership contention: another process claimed lock during reclamation",
        );
      }
      throw new Error(`Failed to acquire execution ownership lock: ${err.message}`);
    }
  }

  updateHeartbeat() {
    if (!this.isHeld) return false;
    try {
      if (!fs.existsSync(this.lockPath)) {
        this.isHeld = false;
        return false;
      }
      const content = fs.readFileSync(this.lockPath, "utf8");
      const lockData = JSON.parse(content);
      if (lockData.ownerId !== this.ownerId) {
        this.isHeld = false;
        return false;
      }
      lockData.heartbeatAt = Date.now();
      const tmpPath = `${this.lockPath}.hb.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
      const fd = fs.openSync(tmpPath, "w");
      try {
        fs.writeFileSync(fd, JSON.stringify(lockData, null, 2), "utf8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmpPath, this.lockPath);
      this.lastHeartbeatTime = Date.now();
      return true;
    } catch (e) {
      this.isHeld = false;
      return false;
    }
  }

  startHeartbeat(intervalMs = Math.floor(this.leaseTimeoutMs / 3)) {
    this.stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      try {
        this.updateHeartbeat();
      } catch (e) {
        this.isHeld = false;
      }
    }, intervalMs);
    if (this._heartbeatTimer && this._heartbeatTimer.unref) {
      this._heartbeatTimer.unref();
    }
  }

  stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  assertOwnership() {
    if (!this.isHeld) {
      throw new ExecutionOwnershipError(
        `Execution ownership not held (local isHeld is false). Owner: ${this.ownerId}`,
      );
    }

    // 1. Local lease expiry check (detects event-loop freeze or pause without waiting for disk)
    const localAge = Date.now() - (this.lastHeartbeatTime || 0);
    if (localAge > this.leaseTimeoutMs) {
      this.isHeld = false;
      throw new ExecutionOwnershipError(
        `Execution ownership lease expired locally (${localAge}ms > ${this.leaseTimeoutMs}ms). Process paused or heartbeat lapsed.`,
      );
    }

    // 2. On-disk fencing check (detects reclamation or external lock supersession)
    if (!fs.existsSync(this.lockPath)) {
      this.isHeld = false;
      throw new ExecutionOwnershipError(
        `Execution ownership lock file missing from disk: ${this.lockPath}`,
      );
    }

    let existing = null;
    try {
      const content = fs.readFileSync(this.lockPath, "utf8");
      existing = JSON.parse(content);
    } catch (err) {
      this.isHeld = false;
      throw new ExecutionOwnershipError(
        `Execution ownership lock file unreadable or corrupt: ${err.message}`,
      );
    }

    if (existing.ownerId !== this.ownerId) {
      this.isHeld = false;
      throw new ExecutionOwnershipError(
        `Execution ownership superseded by ${existing.ownerId} (PID ${existing.processId}). Local owner ${this.ownerId} is fenced off.`,
        existing,
      );
    }

    return true;
  }

  release() {
    this.stopHeartbeat();
    if (!this.isHeld) return true;
    try {
      if (fs.existsSync(this.lockPath)) {
        const content = fs.readFileSync(this.lockPath, "utf8");
        const lockData = JSON.parse(content);
        if (lockData.ownerId === this.ownerId) {
          fs.unlinkSync(this.lockPath);
        }
      }
    } catch (e) {
      // Ignore cleanup error if already removed
    }
    this.isHeld = false;
    return true;
  }
}
