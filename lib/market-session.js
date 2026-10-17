// Market Sessions, Trading Calendars & Incomplete Candle Quality Manager
// Distinguishes legitimate market closures from unexpected feed outages.
// Enforces incomplete bar handling and timeframe-aware boundaries.

export class MarketSessionManager {
  constructor(options = {}) {
    this.options = {
      defaultCalendar: options.defaultCalendar || "CRYPTO_24_7",
      ...options,
    };

    // US Holidays (YYYY-MM-DD) for NYSE/NASDAQ
    this.usHolidays = new Set([
      "2026-01-01", // New Year's Day
      "2026-01-19", // Martin Luther King Jr. Day
      "2026-02-16", // Washington's Birthday / Presidents' Day
      "2026-04-03", // Good Friday
      "2026-05-25", // Memorial Day
      "2026-06-19", // Juneteenth
      "2026-07-03", // Independence Day (Observed)
      "2026-09-07", // Labor Day
      "2026-11-26", // Thanksgiving Day
      "2026-12-25", // Christmas Day
    ]);
  }

  getInstrumentType(symbol = "") {
    const s = String(symbol).toUpperCase();
    if (s.includes("BTC") || s.includes("ETH") || s.includes("SOL") || s.endsWith("USDT") || s.endsWith("USD")) {
      return "CRYPTO";
    }
    if (s.includes("EUR") || s.includes("GBP") || s.includes("JPY") || s.includes("CHF") || s.includes("AUD")) {
      return "FOREX";
    }
    return "US_EQUITIES";
  }

  /**
   * Evaluates market session state for an instrument at a given timestamp.
   * Timestamp can be in seconds or milliseconds.
   */
  getSession(symbol, timestamp) {
    const tsSec = timestamp > 1e11 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
    const instType = this.getInstrumentType(symbol);

    if (instType === "CRYPTO") {
      return {
        instrumentType: "CRYPTO",
        session: "REGULAR",
        isOpen: true,
        calendar: "24/7/365",
      };
    }

    const date = new Date(tsSec * 1000);
    // Convert UTC to America/New_York
    const nyFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      weekday: "short",
    });

    const parts = nyFormatter.formatToParts(date);
    const map = {};
    for (const p of parts) map[p.type] = p.value;

    const weekday = map.weekday; // Mon, Tue, Wed, Thu, Fri, Sat, Sun
    const yyyyMmDd = `${map.year}-${map.month}-${map.day}`;
    const minutesOfDay = parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10);

    if (instType === "US_EQUITIES") {
      // Weekend check
      if (weekday === "Sat" || weekday === "Sun") {
        return { instrumentType: "US_EQUITIES", session: "CLOSED", isOpen: false, reason: "WEEKEND" };
      }
      // Holiday check
      if (this.usHolidays.has(yyyyMmDd)) {
        return { instrumentType: "US_EQUITIES", session: "CLOSED", isOpen: false, reason: "HOLIDAY" };
      }

      // Pre-market: 04:00 - 09:30 (240m - 570m)
      if (minutesOfDay >= 240 && minutesOfDay < 570) {
        return { instrumentType: "US_EQUITIES", session: "PRE_MARKET", isOpen: false, isExtendedOpen: true };
      }
      // Regular: 09:30 - 16:00 (570m - 960m)
      if (minutesOfDay >= 570 && minutesOfDay < 960) {
        return { instrumentType: "US_EQUITIES", session: "REGULAR", isOpen: true, isExtendedOpen: true };
      }
      // After-hours: 16:00 - 20:00 (960m - 1200m)
      if (minutesOfDay >= 960 && minutesOfDay < 1200) {
        return { instrumentType: "US_EQUITIES", session: "AFTER_HOURS", isOpen: false, isExtendedOpen: true };
      }

      return { instrumentType: "US_EQUITIES", session: "CLOSED", isOpen: false, reason: "OUTSIDE_HOURS" };
    }

    if (instType === "FOREX") {
      // Forex is open Sunday 17:00 ET (1020m) through Friday 17:00 ET (1020m)
      if (weekday === "Sat") {
        return { instrumentType: "FOREX", session: "CLOSED", isOpen: false, reason: "WEEKEND" };
      }
      if (weekday === "Sun" && minutesOfDay < 1020) {
        return { instrumentType: "FOREX", session: "CLOSED", isOpen: false, reason: "WEEKEND" };
      }
      if (weekday === "Fri" && minutesOfDay >= 1020) {
        return { instrumentType: "FOREX", session: "CLOSED", isOpen: false, reason: "WEEKEND" };
      }
      return { instrumentType: "FOREX", session: "REGULAR", isOpen: true };
    }

    return { instrumentType: instType, session: "REGULAR", isOpen: true };
  }

  isMarketOpen(symbol, timestamp, { includeExtended = false } = {}) {
    const sessionInfo = this.getSession(symbol, timestamp);
    if (includeExtended) {
      return Boolean(sessionInfo.isOpen || sessionInfo.isExtendedOpen);
    }
    return Boolean(sessionInfo.isOpen);
  }

  /**
   * Distinguishes a legitimate calendar closure from a feed outage.
   */
  distinguishClosureFromOutage(symbol, lastBarTime, currentTime) {
    const nowSec = currentTime > 1e11 ? Math.floor(currentTime / 1000) : Math.floor(currentTime);
    const session = this.getSession(symbol, nowSec);

    if (!session.isOpen) {
      return {
        isLegitimateClosure: true,
        reason: "MARKET_CLOSED",
        session: session.session,
        detail: session.reason || `Market closed (${session.session})`,
      };
    }

    return {
      isLegitimateClosure: false,
      reason: "FEED_OUTAGE",
      session: session.session,
      detail: `Data stream paused while market is actively open (${session.session})`,
    };
  }

  /**
   * Checks if a candle has concluded its interval and is fully closed.
   */
  isBarComplete(barTime, timeframe = "1m", currentTime = Date.now()) {
    const barSec = barTime > 1e11 ? Math.floor(barTime / 1000) : Math.floor(barTime);
    const nowSec = currentTime > 1e11 ? Math.floor(currentTime / 1000) : Math.floor(currentTime);

    const tfSeconds = {
      "1m": 60,
      "3m": 180,
      "5m": 300,
      "15m": 900,
      "30m": 1800,
      "1h": 3600,
      "2h": 7200,
      "4h": 14400,
      "1D": 86400,
      "1W": 604800,
    };

    const duration = tfSeconds[timeframe] || 60;
    return nowSec >= barSec + duration;
  }
}
