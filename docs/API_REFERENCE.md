# API Reference — Tavoryn Terminal

## 1. Bloomberg Emulation Endpoints

### Snapshot Data (`/api/bdp`)
Returns a snapshot of requested fields for one or more securities, matching Bloomberg's BDP Excel formula.
- **Method:** `GET`
- **Parameters:**
  - `securities`: Comma-separated list (e.g. `AAPL US EQUITY,SPX INDEX`)
  - `fields`: Comma-separated field list (e.g. `NAME,PX_LAST,CHG_PCT_1D,CUR_MKT_CAP,PE_RATIO`)
  - `format`: `csv` (default returns JSON)
- **Response Format:**
  ```json
  [
    {
      "security": "AAPL US EQUITY",
      "NAME": "Apple Inc.",
      "PX_LAST": 344.88,
      "CHG_PCT_1D": 0.56,
      "CUR_MKT_CAP": 5032632221094,
      "PE_RATIO": 40.1
    }
  ]
  ```

### Historical Data (`/api/bdh`)
Returns historical time-series bars matching Bloomberg's BDH Excel formula.
- **Method:** `GET`
- **Parameters:**
  - `security`: Target ticker (e.g. `AAPL US EQUITY`)
  - `fields`: Comma-separated fields (`PX_OPEN,PX_HIGH,PX_LOW,PX_LAST,PX_VOLUME`)
  - `start`: Date string (`YYYY-MM-DD` or relative `-1Y`, `-6M`, `-30D`)
  - `end`: Date string (default: current date)
  - `per`: Periodicity (`D`=Daily, `W`=Weekly, `M`=Monthly)
  - `format`: `csv` or JSON

## 2. Terminal Function Endpoints (`/api/fn/:name`)
Executes the corresponding terminal function module from `lib/fn/`.
- `/api/fn/wei`: World Equity Indices
- `/api/fn/top`: Top News headlines
- `/api/fn/wirp`: Implied Fed Funds Futures rate path
- `/api/fn/gc`: US Treasury and sovereign yield curves
- `/api/fn/omon?symbol=AAPL`: Equity options chain
- `/api/fn/des?symbol=AAPL`: Company description and fundamentals
- `/api/fn/insd?symbol=AAPL`: SEC Form 4 insider transactions
- `/api/fn/eqs`: Equity screener query
- `/api/fn/bndc`: Institutional bond calculator (Yield, Duration, Convexity, DV01)
- `/api/fn/opay`: Options strategy payoff generator
- `/api/fn/trad`: Paper trading portfolio and order manager

## 3. Paper Trading & Risk Controls Endpoints
Requires header `x-qt: 1` and loopback origin for mutation operations.
- `GET /api/fn/trad`: Synchronize portfolio, valuate positions, and return full account report.
- `POST /api/trad/order`: Submit order `{ symbol, side: "BUY"|"SELL", type: "MARKET"|"LIMIT", qty, price }`.
- `POST /api/trad/cancel`: Cancel pending limit order `{ orderId }`.
- `POST /api/trad/reset`: Reset paper account to baseline cash `{ cash: 100000 }`.
- `GET /api/trad/risk-limits`: Retrieve configurable risk limits (`maxOrderNotional`, `maxPositionNotional`, `maxDailyLoss`).
- `POST /api/trad/risk-limits`: Set configurable risk limits `{ maxOrderNotional, maxPositionNotional, maxDailyLoss }`.

## 4. Market Data Endpoints
- `GET /api/candles`: Historical OHLCV bars (`symbol`, `tf`, `limit`, `start`, `end`)
- `GET /api/quotes`: Real-time quote snapshots for multiple tickers
- `GET /api/health`: Server status, loaded feeds, and platform runtime details
- `GET /api/state` & `PUT /api/state`: Read and update layout and workspace state

