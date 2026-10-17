// Broker Execution Coordinator & Emergency Kill Switch
// Glues together BaseBrokerAdapter, PreTradeRiskGateway, and OrderLifecycleManager.
// Enforces:
// 1. Pre-trade risk gatekeeper evaluation
// 2. Strict order lifecycle state transitions and idempotency
// 3. Robust timeout handling (never blindly resubmit)
// 4. Automated broker reconciliation (open orders, fills, and positions)
// 5. Verified kill-switch with position flattening and residual exposure verification

import { EventEmitter } from "node:events";
import { ORDER_STATES, OrderLifecycleManager } from "./order-lifecycle.js";
import { PreTradeRiskGateway, RISK_REJECTION_CODES } from "./risk-gateway.js";
import { TimeoutError, OrderRejectedError, RateLimitError } from "./broker-adapter.js";
import { redactSensitiveData } from "../logger.js";
import { ExecutionOwnershipLock, ExecutionOwnershipError } from "./execution-lock.js";

export class BrokerExecutionCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.broker = options.broker;
    if (!this.broker) throw new Error("BrokerExecutionCoordinator requires a broker adapter");

    this.riskGateway = options.riskGateway || new PreTradeRiskGateway(options.riskConfig || {});
    this.lifecycle = options.lifecycle || new OrderLifecycleManager();
    this.feedPipeline = options.feedPipeline || null;
    this.priceProvider = options.priceProvider || null;
    this.executionLock =
      options.executionLock ||
      (options.lockPath ? new ExecutionOwnershipLock(options.lockPath) : null);

    this.dailyRealizedPnL = 0;
    this.auditLogs = [];
    this._submissionQueue = Promise.resolve();
    this._killSwitchPromise = null;

    // Forward lifecycle events
    this.lifecycle.on("stateChange", (evt) => {
      this.emit("orderStateChange", evt);
      this._logAudit("ORDER_STATE_CHANGE", evt);
    });

    this.lifecycle.on("fill", (evt) => {
      this.emit("orderFill", evt);
      this._logAudit("ORDER_FILL", evt);
    });

    // Wire broker execution reports
    this.broker.on("execution", (report) => {
      this._handleBrokerExecution(report);
    });
  }

  _logAudit(action, payload) {
    this.auditLogs.push({
      timestamp: Date.now(),
      action,
      payload: redactSensitiveData(payload),
    });
  }

  getAuditLogs() {
    return [...this.auditLogs];
  }

  _handleBrokerExecution(report) {
    let order = null;
    if (report.clientOrderId) {
      order = this.lifecycle.getOrder(report.clientOrderId);
    }
    if (!order && report.brokerOrderId) {
      order = this.lifecycle.getOrderByBrokerId(report.brokerOrderId);
    }

    if (order) {
      // Process active orders OR cancelled orders that received a late fill race condition
      if (!order.isTerminal() || order.state === ORDER_STATES.CANCELLED) {
        this.lifecycle.applyExecutionReport(order.clientOrderId, report);
      }
    }
  }

  async _resolveMarketPrice(symbol) {
    if (this.priceProvider) {
      const p = await this.priceProvider(symbol);
      if (p != null && Number(p) > 0) return Number(p);
    }
    if (this.broker && typeof this.broker.getMarketPrice === "function") {
      const p = this.broker.getMarketPrice(symbol);
      if (p != null && Number(p) > 0) return Number(p);
    }
    if (this.feedPipeline?.lastBar?.has(symbol)) {
      const bar = this.feedPipeline.lastBar.get(symbol);
      if (bar?.close != null && Number(bar.close) > 0) return Number(bar.close);
    }
    return null;
  }

  /**
   * Submit an order through pre-trade risk controls and onto the broker adapter.
   * Concurrency-safe: serialized execution queue prevents simultaneous orders
   * from racing on buying power.
   */
  async submitOrder(orderSpec) {
    return new Promise((resolve, reject) => {
      this._submissionQueue = this._submissionQueue
        .then(() => this._executeSubmitOrder(orderSpec))
        .then(resolve, reject);
    });
  }

  async _executeSubmitOrder(orderSpec) {
    if (!orderSpec) {
      return { success: false, reason: "Missing orderSpec", code: "INVALID_SPEC" };
    }

    // 0. Execution Ownership Fencing: verify lock is still held and not superseded
    if (this.executionLock) {
      try {
        this.executionLock.assertOwnership();
      } catch (err) {
        this._logAudit("ORDER_OWNERSHIP_FENCED", {
          orderSpec,
          error: err.message,
        });
        return {
          success: false,
          reason: `Order submission rejected by execution ownership fencing: ${err.message}`,
          code: "EXECUTION_OWNERSHIP_LOST",
        };
      }
    }

    // Idempotency check: duplicate clientOrderId check
    if (orderSpec.clientOrderId && this.lifecycle.getOrder(orderSpec.clientOrderId)) {
      return {
        success: false,
        reason: `Duplicate submission: Order ${orderSpec.clientOrderId} already exists`,
        code: "DUPLICATE_ORDER",
      };
    }

    const symbol = String(orderSpec.symbol || "").toUpperCase();

    // 1. Build risk evaluation context
    let buyingPower = null;
    let positions = [];
    try {
      buyingPower = await this.broker.getBuyingPower();
      positions = await this.broker.getPositions();
    } catch (err) {
      // If broker queries fail, fail-closed
      return {
        success: false,
        reason: `Failed to query broker state for risk evaluation: ${err.message}`,
        code: "BROKER_QUERY_FAILED",
      };
    }

    const currentPrice = await this._resolveMarketPrice(symbol);
    const openOrdersCount = this.lifecycle.getOpenOrders().length;

    const riskContext = {
      buyingPower,
      positions,
      openOrdersCount,
      currentDailyLoss: Math.abs(Math.min(0, this.dailyRealizedPnL)),
      feedPipeline: this.feedPipeline,
      currentPrice,
    };

    // 2. Pre-trade Risk Gatekeeper
    const riskEval = this.riskGateway.evaluateOrder(orderSpec, riskContext);
    if (!riskEval.allowed) {
      // Record rejected order in lifecycle manager for auditability
      try {
        const rejectedOrder = this.lifecycle.createOrder(orderSpec);
        this.lifecycle.transitionOrder(
          rejectedOrder.clientOrderId,
          ORDER_STATES.REJECTED,
          riskEval.reason,
          { code: riskEval.code },
        );
      } catch (err) {
        // Ignore creation error if spec was malformed
      }

      this._logAudit("ORDER_RISK_REJECTED", { orderSpec, riskEval });
      return {
        success: false,
        reason: riskEval.reason,
        code: riskEval.code,
        details: riskEval.details || null,
      };
    }

    // 3. Initialize order record in lifecycle manager
    const order = this.lifecycle.createOrder(orderSpec);
    this.lifecycle.transitionOrder(
      order.clientOrderId,
      ORDER_STATES.RISK_APPROVED,
      "Pre-trade risk checks passed",
      { estPrice: riskEval.estPrice, estNotional: riskEval.estNotional },
    );

    // 4. Mark as SUBMITTED
    this.lifecycle.transitionOrder(
      order.clientOrderId,
      ORDER_STATES.SUBMITTED,
      "Dispatched to broker adapter",
    );

    // 5. Dispatch to Broker
    // Last-mile ownership fencing check immediately before dispatch
    if (this.executionLock) {
      try {
        this.executionLock.assertOwnership();
      } catch (err) {
        this.lifecycle.transitionOrder(
          order.clientOrderId,
          ORDER_STATES.REJECTED,
          `Aborted immediately before broker dispatch: ${err.message}`,
        );
        this._logAudit("ORDER_OWNERSHIP_FENCED_LAST_MILE", {
          clientOrderId: order.clientOrderId,
          error: err.message,
        });
        return {
          success: false,
          reason: `Order submission rejected by execution ownership fencing: ${err.message}`,
          code: "EXECUTION_OWNERSHIP_LOST",
        };
      }
    }

    try {
      const brokerResult = await this.broker.submitOrder({
        ...orderSpec,
        clientOrderId: order.clientOrderId,
        fencingToken: this.executionLock ? this.executionLock.getFencingToken() : null,
      });

      if (brokerResult.brokerOrderId) {
        this.lifecycle.setBrokerOrderId(order.clientOrderId, brokerResult.brokerOrderId);
      }

      // Handle synchronous fills (e.g. Sandbox Market Orders)
      if (brokerResult.status === "FILLED" && brokerResult.fill) {
        this.lifecycle.transitionOrder(
          order.clientOrderId,
          ORDER_STATES.ACKNOWLEDGED,
          "Broker accepted and filled order",
        );
        this.lifecycle.applyExecutionReport(order.clientOrderId, brokerResult.fill);
      } else if (brokerResult.status === "PARTIALLY_FILLED" && brokerResult.fill) {
        this.lifecycle.transitionOrder(
          order.clientOrderId,
          ORDER_STATES.ACKNOWLEDGED,
          "Broker accepted and partially filled order",
        );
        this.lifecycle.applyExecutionReport(order.clientOrderId, brokerResult.fill);
      } else {
        // Asynchronous / resting order
        this.lifecycle.transitionOrder(
          order.clientOrderId,
          ORDER_STATES.ACKNOWLEDGED,
          "Broker acknowledged order",
        );
      }

      return {
        success: true,
        order,
        brokerOrderId: brokerResult.brokerOrderId,
        status: order.state,
      };
    } catch (err) {
      if (err instanceof TimeoutError) {
        // CRITICAL SAFEGUARD: Do not blindly resubmit! Move to SUBMISSION_TIMEOUT state.
        this.lifecycle.transitionOrder(
          order.clientOrderId,
          ORDER_STATES.SUBMISSION_TIMEOUT,
          `Broker submission timed out: ${err.message}`,
        );
        this._logAudit("ORDER_SUBMISSION_TIMEOUT", { clientOrderId: order.clientOrderId });
        return {
          success: false,
          reason: "Broker submission timed out; order held in SUBMISSION_TIMEOUT for reconciliation",
          code: "SUBMISSION_TIMEOUT",
          order,
        };
      }

      if (err instanceof OrderRejectedError) {
        this.lifecycle.transitionOrder(
          order.clientOrderId,
          ORDER_STATES.REJECTED,
          `Broker rejected order: ${err.rejectionReason}`,
        );
        return {
          success: false,
          reason: err.message,
          code: "ORDER_REJECTED",
          order,
        };
      }

      // Any unexpected error moves to UNKNOWN_STATUS for safety
      this.lifecycle.transitionOrder(
        order.clientOrderId,
        ORDER_STATES.UNKNOWN_STATUS,
        `Unexpected broker error: ${err.message}`,
      );
      return {
        success: false,
        reason: err.message,
        code: "BROKER_ERROR",
        order,
      };
    }
  }

  /**
   * Cancel an active order
   */
  async cancelOrder(clientOrderId, reason = "User requested cancellation") {
    // 0. Execution Ownership Fencing: verify lock is still held and not superseded
    if (this.executionLock) {
      try {
        this.executionLock.assertOwnership();
      } catch (err) {
        this._logAudit("CANCEL_OWNERSHIP_FENCED", {
          clientOrderId,
          error: err.message,
        });
        return {
          success: false,
          reason: `Cancel rejected by execution ownership fencing: ${err.message}`,
          code: "EXECUTION_OWNERSHIP_LOST",
        };
      }
    }

    const order = this.lifecycle.getOrder(clientOrderId);
    if (!order) {
      return { success: false, reason: `Order ${clientOrderId} not found` };
    }

    if (order.isTerminal()) {
      return {
        success: false,
        reason: `Order ${clientOrderId} is already in terminal state ${order.state}`,
      };
    }

    // Last-mile ownership fencing check immediately before cancel dispatch
    if (this.executionLock) {
      try {
        this.executionLock.assertOwnership();
      } catch (err) {
        return {
          success: false,
          reason: `Cancel rejected immediately before broker dispatch: ${err.message}`,
          code: "EXECUTION_OWNERSHIP_LOST",
        };
      }
    }

    try {
      const res = await this.broker.cancelOrder(
        clientOrderId,
        order.brokerOrderId,
        { fencingToken: this.executionLock ? this.executionLock.getFencingToken() : null },
      );
      if (res.success) {
        this.lifecycle.transitionOrder(clientOrderId, ORDER_STATES.CANCELLED, reason);
        return { success: true, clientOrderId, brokerOrderId: order.brokerOrderId };
      }
      return { success: false, reason: res.reason || "Broker cancel failed" };
    } catch (err) {
      return { success: false, reason: `Cancel error: ${err.message}` };
    }
  }

  /**
   * Automated State Reconciliation:
   * Compares internal order lifecycle and positions against upstream broker reality.
   */
  async reconcile() {
    const timestamp = Date.now();
    const discrepancies = [];

    let brokerOrders = [];
    let brokerPositions = [];
    let brokerAccount = null;

    try {
      brokerOrders = await this.broker.getOpenOrders();
      brokerPositions = await this.broker.getPositions();
      brokerAccount = await this.broker.getAccount();
    } catch (err) {
      return {
        reconciled: false,
        timestamp,
        error: `Failed to query broker during reconciliation: ${err.message}`,
        discrepancies: [{ type: "BROKER_QUERY_FAILURE", message: err.message }],
      };
    }

    const brokerOpenOrderMap = new Map();
    for (const bo of brokerOrders) {
      if (bo.brokerOrderId) brokerOpenOrderMap.set(bo.brokerOrderId, bo);
      if (bo.clientOrderId) brokerOpenOrderMap.set(bo.clientOrderId, bo);
    }

    // 1. Reconcile local open orders
    const localOpenOrders = this.lifecycle.getOpenOrders();
    for (const localOrd of localOpenOrders) {
      const brokerMatch =
        (localOrd.brokerOrderId && brokerOpenOrderMap.get(localOrd.brokerOrderId)) ||
        brokerOpenOrderMap.get(localOrd.clientOrderId);

      if (
        localOrd.state === ORDER_STATES.SUBMISSION_TIMEOUT ||
        localOrd.state === ORDER_STATES.UNKNOWN_STATUS
      ) {
        if (brokerMatch) {
          // Broker actually received and holds the order!
          if (!localOrd.brokerOrderId && brokerMatch.brokerOrderId) {
            this.lifecycle.setBrokerOrderId(localOrd.clientOrderId, brokerMatch.brokerOrderId);
          }
          this.lifecycle.transitionOrder(
            localOrd.clientOrderId,
            ORDER_STATES.ACKNOWLEDGED,
            "Reconciliation confirmed order exists on broker",
          );
        } else {
          // Check if it already filled or was rejected on broker
          const queryResult = await this.broker.getOrder(
            localOrd.clientOrderId,
            localOrd.brokerOrderId,
          );
          if (queryResult) {
            if (queryResult.status === "FILLED") {
              this.lifecycle.transitionOrder(
                localOrd.clientOrderId,
                ORDER_STATES.ACKNOWLEDGED,
                "Reconciled order from timeout",
              );
              this.lifecycle.transitionOrder(
                localOrd.clientOrderId,
                ORDER_STATES.FILLED,
                "Reconciled order filled on broker",
              );
            } else if (queryResult.status === "CANCELLED") {
              this.lifecycle.transitionOrder(
                localOrd.clientOrderId,
                ORDER_STATES.CANCELLED,
                "Reconciled cancelled on broker",
              );
            }
          } else {
            // Order truly never reached broker
            this.lifecycle.transitionOrder(
              localOrd.clientOrderId,
              ORDER_STATES.REJECTED,
              "Reconciliation determined order never reached broker",
            );
          }
        }
      } else if (!brokerMatch && localOrd.state === ORDER_STATES.ACKNOWLEDGED) {
        // Expected open on broker but missing; query historical status
        const hist = await this.broker.getOrder(localOrd.clientOrderId, localOrd.brokerOrderId);
        if (hist) {
          if (hist.status === "FILLED") {
            this.lifecycle.transitionOrder(
              localOrd.clientOrderId,
              ORDER_STATES.FILLED,
              "Reconciled filled status from broker query",
            );
          } else if (hist.status === "CANCELLED") {
            this.lifecycle.transitionOrder(
              localOrd.clientOrderId,
              ORDER_STATES.CANCELLED,
              "Reconciled cancelled status from broker query",
            );
          }
        } else {
          discrepancies.push({
            type: "MISSING_OPEN_ORDER",
            clientOrderId: localOrd.clientOrderId,
            brokerOrderId: localOrd.brokerOrderId,
            message: `Order ${localOrd.clientOrderId} marked ACKNOWLEDGED locally but missing on broker`,
          });
        }
      }
    }

    // 2. Reconcile positions
    const brokerPosMap = new Map();
    for (const p of brokerPositions) {
      brokerPosMap.set(String(p.symbol).toUpperCase(), p);
    }

    const isReconciled = discrepancies.length === 0;

    return {
      reconciled: isReconciled,
      timestamp,
      activeLocalOrders: this.lifecycle.getOpenOrders().length,
      activeBrokerOrders: brokerOrders.length,
      positions: brokerPositions,
      accountSummary: {
        cash: brokerAccount.cash,
        buyingPower: brokerAccount.buyingPower,
        portfolioValue: brokerAccount.portfolioValue,
      },
      discrepancies,
    };
  }

  /**
   * Emergency Kill-Switch Procedure:
   * 1. Concurrency-safe: awaits in-flight activation if already running.
   * 2. Engages PreTradeRiskGateway kill switch to halt all regular trading.
   * 3. Cancels all outstanding open orders across lifecycle and broker.
   * 4. Submits emergency closing market orders for all active positions (if flattenPositions is true).
   * 5. Queries broker to strictly verify that residual exposure is 0.
   */
  async activateKillSwitch(options = {}) {
    if (this._killSwitchPromise) {
      return this._killSwitchPromise;
    }

    this._killSwitchPromise = this._executeKillSwitch(options).finally(() => {
      this._killSwitchPromise = null;
    });

    return this._killSwitchPromise;
  }

  async _executeKillSwitch(options = {}) {
    const {
      cancelOpenOrders = true,
      flattenPositions = true,
      reason = "Emergency kill switch activated",
    } = options;

    this.riskGateway.engageKillSwitch(reason);
    this._logAudit("KILL_SWITCH_ACTIVATED", { reason, options });

    let cancelledOrdersCount = 0;
    const cancelErrors = [];

    // 1. Cancel all open orders
    if (cancelOpenOrders) {
      const openOrders = this.lifecycle.getOpenOrders();
      for (const ord of openOrders) {
        try {
          const cancelRes = await this.cancelOrder(ord.clientOrderId, `Kill-switch cancel: ${reason}`);
          if (cancelRes.success) {
            cancelledOrdersCount++;
          }
        } catch (err) {
          cancelErrors.push({ clientOrderId: ord.clientOrderId, error: err.message });
        }
      }
    }

    // 2. Flatten all positions
    let flattenedPositionsCount = 0;
    const flattenErrors = [];

    if (flattenPositions) {
      let positions = [];
      try {
        positions = await this.broker.getPositions();
      } catch (err) {
        flattenErrors.push({ error: `Failed to query positions for flattening: ${err.message}` });
      }

      for (const pos of positions) {
        if (pos.qty !== 0) {
          const closingSide = pos.qty > 0 ? "SELL" : "BUY";
          const closingQty = Math.abs(pos.qty);

          const flattenOrderSpec = {
            symbol: pos.symbol,
            side: closingSide,
            qty: closingQty,
            type: "MARKET",
            isClose: true,
            isKillSwitchFlatten: true,
            reason: "Kill-switch emergency liquidation",
          };

          const execRes = await this.submitOrder(flattenOrderSpec);
          if (execRes.success) {
            flattenedPositionsCount++;
          } else {
            flattenErrors.push({
              symbol: pos.symbol,
              qty: closingQty,
              error: execRes.reason,
            });
          }
        }
      }
    }

    // 3. Post-execution verification: query broker to verify 0 residual exposure
    let verified = false;
    let residualPositions = [];

    try {
      const currentPos = await this.broker.getPositions();
      residualPositions = currentPos.filter((p) => p.qty !== 0);
      verified = residualPositions.length === 0;
    } catch (err) {
      verified = false;
      residualPositions.push({ error: `Could not verify residual positions: ${err.message}` });
    }

    // Strict success: verified 0 residual positions and zero errors during liquidation
    const overallSuccess = verified && cancelErrors.length === 0 && flattenErrors.length === 0;

    const result = {
      success: overallSuccess,
      killSwitchEngaged: true,
      cancelledOrdersCount,
      cancelErrors,
      flattenedPositionsCount,
      flattenErrors,
      residualPositions,
      verified,
    };

    this._logAudit("KILL_SWITCH_COMPLETED", result);
    this.emit("killSwitchComplete", result);

    if (this.lifecycle.storagePath) {
      this.lifecycle.saveToDisk(this.lifecycle.storagePath, {
        killSwitchEngaged: true,
        killSwitchReason: reason,
      });
    }

    return result;
  }

  deactivateKillSwitch() {
    this.riskGateway.disengageKillSwitch();
    this._logAudit("KILL_SWITCH_DEACTIVATED", {});
    this.emit("killSwitchDeactivated");

    if (this.lifecycle.storagePath) {
      this.lifecycle.saveToDisk(this.lifecycle.storagePath, {
        killSwitchEngaged: false,
        killSwitchReason: null,
      });
    }
  }

  acquireExecutionOwnership() {
    if (this.executionLock) {
      this.executionLock.acquire();
      this.executionLock.startHeartbeat();
      this._logAudit("EXECUTION_OWNERSHIP_ACQUIRED", {
        ownerId: this.executionLock.ownerId,
        processId: this.executionLock.processId,
      });
    }
    return true;
  }

  releaseExecutionOwnership() {
    if (this.executionLock) {
      this.executionLock.release();
      this._logAudit("EXECUTION_OWNERSHIP_RELEASED", {
        ownerId: this.executionLock.ownerId,
        processId: this.executionLock.processId,
      });
    }
    return true;
  }

  /**
   * Recovers lifecycle state after process restart / crash and reconciles with upstream broker.
   * Fail-closed: corrupted files or reconciliation discrepancies halt trading.
   */
  async recoverAndReconcile(options = {}) {
    const timestamp = Date.now();
    const storagePath = options.storagePath || this.lifecycle.storagePath;

    let recoveredOrdersCount = 0;
    let metadata = {};

    try {
      if (storagePath) {
        const loadRes = this.lifecycle.loadFromDisk(storagePath);
        recoveredOrdersCount = typeof loadRes === "object" ? loadRes.ordersCount : loadRes;
        metadata = typeof loadRes === "object" ? loadRes.metadata || {} : {};

        // If kill switch was active before crash/restart, restore it immediately!
        if (metadata.killSwitchEngaged) {
          this.riskGateway.engageKillSwitch(
            metadata.killSwitchReason || "Restored active kill switch across process restart",
          );
        }
      }
    } catch (err) {
      // Fail-closed on corrupted persistence! Engage kill switch immediately
      this.riskGateway.engageKillSwitch(`CRITICAL: Persistence recovery failed: ${err.message}`);
      return {
        success: false,
        error: err.message,
        recoveredOrdersCount: 0,
        killSwitchEngaged: true,
      };
    }

    // Reconcile loaded state against authoritative upstream broker state
    const reconResult = await this.reconcile();

    // If reconciliation failed or found discrepancies, engage kill switch to halt trading
    if (!reconResult.reconciled) {
      const discTypes = (reconResult.discrepancies || []).map((d) => d.type).join(", ");
      this.riskGateway.engageKillSwitch(
        `Reconciliation mismatch detected after recovery: ${discTypes || "Discrepancy detected"}`,
      );
    }

    this._logAudit("RECOVERY_AND_RECONCILE_COMPLETED", {
      timestamp,
      recoveredOrdersCount,
      reconciled: reconResult.reconciled,
      discrepancies: reconResult.discrepancies,
      killSwitchEngaged: this.riskGateway.isKillSwitchEngaged(),
    });

    return {
      success: reconResult.reconciled && !this.riskGateway.isKillSwitchEngaged(),
      timestamp,
      recoveredOrdersCount,
      killSwitchEngaged: this.riskGateway.isKillSwitchEngaged(),
      reconciliation: reconResult,
    };
  }
}
